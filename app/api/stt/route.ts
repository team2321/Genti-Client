import { NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import ffmpegInstaller from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { existsSync } from "fs";

export const runtime = "nodejs";



/*
// ==========================================================================
// macOS FFmpeg 경로 설정
const possiblePaths = [
  "/opt/homebrew/bin/ffmpeg",
  "/usr/local/bin/ffmpeg",
  "/opt/local/bin/ffmpeg",
  "/usr/bin/ffmpeg",
];

let ffmpegPath: string | undefined;

for (const testPath of possiblePaths) {
  if (existsSync(testPath)) {
    ffmpegPath = testPath;
    console.log("✅ Found system FFmpeg at:", ffmpegPath);
    break;
  }
}

if (!ffmpegPath) {
  console.warn(
    "⚠️ FFmpeg not found in common locations, trying system PATH..."
  );
  ffmpegPath = "ffmpeg";
}

try {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log("🎬 Using FFmpeg from:", ffmpegPath);
} catch (error) {
  console.error("❌ Failed to set FFmpeg path:", error);
  console.error("💡 Please install FFmpeg: brew install ffmpeg");
}
*/



// ==========================================================================
// Window FFmpeg
// FFmpeg 경로 강제 지정
// ffmpeg-static이 주는 경로가 꼬였을 때, 직접 node_modules 안을 가리키게 합니다.
let ffmpegPath = ffmpegInstaller;

// 만약 경로가 이상하게(\ROOT...) 잡히거나 윈도우 환경이라면 강제로 절대 경로를 만듭니다.
if (process.platform === 'win32') {
  // 현재 프로젝트 폴더(process.cwd())를 기준으로 실제 파일 위치를 찾습니다.
  ffmpegPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
}

// fluent-ffmpeg에 설정
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log("✅ FFmpeg Path Set:", ffmpegPath); // 서버 로그에서 경로 확인용
}

// ==========================================================================
// Content Safety 타입 정의
type Category = "Hate" | "SelfHarm" | "Sexual" | "Violence";

interface AnalysisResult {
  category: Category;
  severity: number;
}

interface SafetyResponse {
  blocklistsMatch: any[];
  categoriesAnalysis: AnalysisResult[];
  error?: { code: string; message: string };
}

interface ResponseGuide {
  situation: string;
  current_action: string;
  current_script: string;
  next_steps: string[];
  reportable?: boolean;
  report_reason?: string;
  matched_law?: string;
}

interface SearchDocument {
  category: string;
  subcategory: string;
  regulation: string;
  article: string;
  content: string;
  penalty: string;
}



// ==========================================================================
// Azure AI Search로 법규 검색 함수
async function searchRegulations(userText: string): Promise<{
  reportable: boolean;
  report_reason: string | null;
  matched_law: string | null;
}> {
  const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT!;
  const searchKey = process.env.AZURE_SEARCH_KEY!;
  const indexName = process.env.AZURE_SEARCH_INDEX_NAME || "report-index";

  try {
    // Azure AI Search에 의미 검색 요청
    const searchUrl = `${searchEndpoint}/indexes/${indexName}/docs/search?api-version=2023-11-01`;

    const searchResponse = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": searchKey,
      },
      body: JSON.stringify({
        search: userText,
        searchMode: "all",
        queryType: "semantic",
        semanticConfiguration: "default",
        top: 5,
        select: "category,subcategory,regulation,article,content,penalty",
        queryLanguage: "ko-KR",
      }),
    });

    if (!searchResponse.ok) {
      console.error("Search API Error:", searchResponse.statusText);
      return { reportable: false, report_reason: null, matched_law: null };
    }

    const searchData = await searchResponse.json();

    // 검색 결과 분석
    if (searchData.value && searchData.value.length > 0) {
      // 가장 관련도 높은 법규 확인
      const topMatch = searchData.value[0];

      // 신고 가능 여부 판단 (특정 키워드나 카테고리 확인)
      const reportableCategories = ["형법", "성폭력처벌법", "정보통신망법"];
      const reportableKeywords = ["협박", "모욕", "명예훼손", "성희롱", "폭행"];

      const isReportable =
        reportableCategories.some(
          (cat) =>
            topMatch.category?.includes(cat) ||
            topMatch.regulation?.includes(cat)
        ) ||
        reportableKeywords.some((keyword) =>
          topMatch.content?.includes(keyword)
        );

      if (isReportable) {
        const lawName = topMatch.article
          ? `${topMatch.regulation} ${topMatch.article}`
          : topMatch.regulation;

        return {
          reportable: true,
          report_reason: `고객 발화가 '${lawName}' 규정과 의미적으로 유사한 ${
            topMatch.subcategory || "위협적"
          } 표현입니다.`,
          matched_law: lawName,
        };
      }
    }

    return { reportable: false, report_reason: null, matched_law: null };
  } catch (error) {
    console.error("Error searching regulations:", error);
    return { reportable: false, report_reason: null, matched_law: null };
  }
}

// ==========================================================================
// Azure OpenAI 대응 가이드 생성 함수 (법규 정보 포함)
async function generateResponseGuide(
  sttText: string,
  safetyResult: SafetyResponse,
  regulationInfo: {
    reportable: boolean;
    report_reason: string | null;
    matched_law: string | null;
  }
): Promise<ResponseGuide | null> {
  const apiKey = process.env.AZURE_OPENAI_KEY!;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deploymentName = "smu-team6-gpt-4o-mini";
  const apiVersion = "2024-02-15-preview";

  const url = `${endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  const systemPrompt = `당신은 콜센터 상담원을 지원하는 전문 어시스턴트입니다.

목적:
- 고객의 공격적·모욕적 발화를 들은 상담원이 감정적으로 휘둘리지 않고, 회사 매뉴얼에 맞게 침착하게 대응하도록 '상황 요약'과 '단계별 응대 가이드'를 생성하는 것이 당신의 역할입니다.

언어 규칙:
- 답변은 항상 자연스러운 한국어로만 작성합니다.
- 반말, 속어, 비속어, 영어 표현은 사용하지 않습니다.
- 고객의 욕설·비하 표현은 절대 그대로 인용하지 않습니다.

상황 요약(situation) 작성 규칙:
- 감정을 섞지 않고, 객관적인 서술형으로 작성합니다.
- 욕설·모욕·비하는 "심한 욕설", "모욕적인 표현", "공격적인 표현", "위협적 표현" 등으로 치환합니다.

톤 & 스타일 지침:
- 고객을 비난하거나 가르치는 느낌을 주지 않습니다.
- 책임을 떠넘기거나 방어적으로 들리는 표현을 사용하지 않습니다.
- 감정적인 표현은 사용하지 않습니다.
- 항상 차분하고 공손한 존댓말을 사용합니다.

${
  regulationInfo.reportable
    ? `
신고 가능 상황:
- 현재 고객의 발화는 법적으로 신고 가능한 수준입니다.
- next_steps에 "반복적 위협 발생 시 보고" 또는 유사한 내용을 포함하세요.
`
    : ""
}

출력 형식:
- 반드시 아래 JSON 형식만 출력합니다. JSON 외 텍스트 절대 금지.
{
  "situation": "객관적인 상황 요약 (1-2문장)",
  "current_action": "지금 즉시 해야 할 행동",
  "current_script": "응대 문구 (1-2문장)",
  "next_steps": ["다음 단계 1", "다음 단계 2", "다음 단계 3"],
  "reportable": true or false,
  "report_reason": "신고 가능한 이유",
  "matched_law": "해당 발언이 신고 가능한 법적 근거"
}`;

  const fetchOpenAI = async (inputText: string) => {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `고객 발화: ${inputText}` },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });
  };

  try {
    console.log("🤖 Generating guide...");
    let response = await fetchOpenAI(sttText);

    if (response.status === 400) {
      console.warn(
        "⚠️ OpenAI blocked raw text. Retrying with sanitized description..."
      );
      const detectedCategories = safetyResult.categoriesAnalysis
        .filter((c) => c.severity > 0)
        .map((c) => `${c.category} (Severity: ${c.severity})`)
        .join(", ");

      const sanitizedText = `(The user input was blocked by safety filters. Detected: ${detectedCategories}. Please provide a general guide for this type of aggression.)`;
      response = await fetchOpenAI(sanitizedText);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`❌ OpenAI API Error (${response.status}):`, errorBody);
      return null;
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // JSON 파싱 및 정리
    const guideResult = JSON.parse(content);

    // "1단계:", "2단계:" 같은 접두사 제거
    if (guideResult.current_action) {
      guideResult.current_action = guideResult.current_action
        .replace(/^\d+단계:\s*/, "")
        .replace(/^1\.\s*/, "")
        .trim();
    }

    if (guideResult.next_steps) {
      guideResult.next_steps = guideResult.next_steps.map((step: string) =>
        step
          .replace(/^\d+단계:\s*/, "")
          .replace(/^\d+\.\s*/, "")
          .trim()
      );
    }

    // 법규 정보 추가
    if (regulationInfo.reportable) {
      guideResult.reportable = true;
      guideResult.report_reason = regulationInfo.report_reason;
      guideResult.matched_law = regulationInfo.matched_law;
    } else {
      guideResult.reportable = false;
    }

    return guideResult;
  } catch (error) {
    console.error("Error generating guide:", error);
    return null;
  }
}

// ==========================================================================
// API Handler
export async function POST(req: Request) {
  let tempInputPath: string | null = null;
  let tempOutputPath: string | null = null;

  try {
    const form = await req.formData();
    const file = form.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // 임시 파일 경로 생성
    const tempDir = os.tmpdir();
    const randomId = Math.random().toString(36).substring(7);
    tempInputPath = path.join(tempDir, `input_${randomId}.webm`);
    tempOutputPath = path.join(tempDir, `output_${randomId}.wav`);

    // WebM 파일을 임시 파일로 저장
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    await fs.writeFile(tempInputPath, buffer);

    console.log("📁 Temp input file created:", tempInputPath);

    // FFmpeg로 변환
    try {
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(tempInputPath!)
          .outputOptions(["-acodec", "pcm_s16le", "-ac", "1", "-ar", "16000"])
          .output(tempOutputPath!)
          .on("start", (commandLine) => {
            console.log("🎬 FFmpeg command:", commandLine);
          })
          .on("end", () => {
            console.log("✅ FFmpeg conversion successful");
            resolve();
          })
          .on("error", (err) => {
            console.error("❌ FFmpeg conversion error:", err);
            reject(err);
          });

        command.run();
      });
    } catch (ffmpegError) {
      console.error("FFmpeg failed:", ffmpegError);

      if ((ffmpegError as any).message?.includes("ENOENT")) {
        return NextResponse.json(
          {
            error: "FFmpeg not found. Please install FFmpeg first.",
            install: "Run: brew install ffmpeg",
            details:
              ffmpegError instanceof Error
                ? ffmpegError.message
                : "Unknown error",
          },
          { status: 500 }
        );
      }

      throw ffmpegError;
    }

    // 변환된 WAV 파일 읽기
    const wavBuffer = await fs.readFile(tempOutputPath);
    console.log("📊 WAV file size:", wavBuffer.length, "bytes");

    // Azure Speech 설정
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY!,
      process.env.AZURE_SPEECH_REGION!
    );
    speechConfig.speechRecognitionLanguage = "ko-KR";

    // PushStream을 사용하여 오디오 데이터 전달
    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(wavBuffer.buffer);
    pushStream.close();

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    // 음성 인식 실행
    const result = await new Promise<sdk.SpeechRecognitionResult>(
      (resolve, reject) => {
        recognizer.recognizeOnceAsync(
          (result) => {
            recognizer.close();
            resolve(result);
          },
          (error) => {
            recognizer.close();
            reject(error);
          }
        );
      }
    );

    // 결과 확인 및 처리
    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
      console.log("🎤 Recognition successful:", result.text);

      // Content Safety API 호출
      const safetyEndpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT!;
      const safetyKey = process.env.AZURE_CONTENT_SAFETY_KEY!;
      const apiVersion = "2024-09-01";

      const safetyUrl = `${safetyEndpoint}/contentsafety/text:analyze?api-version=${apiVersion}`;

      const safetyResponse = await fetch(safetyUrl, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": safetyKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: result.text,
          blocklistNames: [],
        }),
      });

      if (!safetyResponse.ok) {
        throw new Error(
          `Content Safety API Error: ${safetyResponse.statusText}`
        );
      }

      const safetyResult: SafetyResponse = await safetyResponse.json();

      // 유해성 판별
      const rejectThresholds: Record<Category, number> = {
        Hate: 0,
        SelfHarm: 0,
        Sexual: 0,
        Violence: 0,
      };

      let finalAction = "Accept";
      const actionDetails: Record<string, string> = {};

      if (safetyResult.categoriesAnalysis) {
        for (const analysis of safetyResult.categoriesAnalysis) {
          const category = analysis.category;
          const severity = analysis.severity;
          const threshold = rejectThresholds[category];

          let action = "Accept";
          if (threshold !== -1 && severity >= threshold) {
            action = "Reject";
            finalAction = "Reject";
          }
          actionDetails[category] = action;
        }
      }

      // Reject인 경우 처리
      let guideResult: ResponseGuide | null = null;

      if (finalAction === "Reject") {
        console.log("🚨 Unsafe content detected. Searching regulations...");

        // 1. Azure AI Search로 법규 검색
        const regulationInfo = await searchRegulations(result.text);
        console.log("📚 Regulation search result:", regulationInfo);

        // 2. OpenAI 가이드 생성 (법규 정보 포함)
        guideResult = await generateResponseGuide(
          result.text,
          safetyResult,
          regulationInfo
        );
      }

      // 최종 응답
      const responsePayload = {
        text: result.text,
        safetyDecision: finalAction,
        safetyDetails: actionDetails,
        rawSafetyResult: safetyResult,
        guide: guideResult,
      };

      console.log(
        "📦 Final JSON Response:\n",
        JSON.stringify(responsePayload, null, 2)
      );

      return NextResponse.json(responsePayload);
    } else if (result.reason === sdk.ResultReason.NoMatch) {
      console.log("❌ No speech recognized");
      return NextResponse.json({ text: "", error: "No speech recognized" });
    } else if (result.reason === sdk.ResultReason.Canceled) {
      const cancellation = sdk.CancellationDetails.fromResult(result);
      console.error("❌ Recognition canceled:", cancellation.reason);
      return NextResponse.json(
        {
          text: "",
          error: `Recognition canceled: ${cancellation.reason}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ text: "" });
  } catch (error) {
    console.error("❌ Error in speech recognition:", error);
    return NextResponse.json(
      {
        error: "Failed to process audio",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // 임시 파일 정리
    try {
      if (tempInputPath && existsSync(tempInputPath)) {
        await fs.unlink(tempInputPath);
        console.log("🗑️ Cleaned up input file");
      }
    } catch (e) {
      console.warn("Could not delete input file:", e);
    }

    try {
      if (tempOutputPath && existsSync(tempOutputPath)) {
        await fs.unlink(tempOutputPath);
        console.log("🗑️ Cleaned up output file");
      }
    } catch (e) {
      console.warn("Could not delete output file:", e);
    }
  }
}