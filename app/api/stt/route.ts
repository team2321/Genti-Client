import { NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import ffmpegInstaller from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import os from "os";
// Azure Search SDK
import { SearchClient, AzureKeyCredential } from "@azure/search-documents";

export const runtime = "nodejs";

// ==========================================================================
// Window FFmpeg 경로 지정
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

// OpenAI 가이드 응답 타입
interface ResponseGuide {
  situation: string;
  current_action: string;
  current_script: string;
  next_steps: string[];
}

// Search Service 규정 검색 결과 타입 정의
interface RegulationInfo {
  category: string;
  subcategory: string;
  regulation: string;
  article: string;
  content: string;
  penalty: string;
  score?: number; // 검색 정확도 점수
}

// ==========================================================================
// Search Service 인덱스에서 모든 subcategory 목록 가져오기 (Facet 활용)
async function getAllSubcategories(): Promise<string[]> {
  const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT!;
  const searchKey = process.env.AZURE_SEARCH_KEY!;
  const indexName = "report-index";

  try {
    const searchClient = new SearchClient(searchEndpoint, indexName, new AzureKeyCredential(searchKey));
    
    // facets 요청: 검색 결과는 0개로 하고(top:0), subcategory 필드의 종류만 가져옴
    const results = await searchClient.search("*", {
      top: 0,
      facets: ["subcategory"], 
    });

    if (results.facets && results.facets.subcategory) {
      // Facet 결과에서 value만 추출하여 배열로 반환
      return results.facets.subcategory.map((f) => String(f.value));
    }
    return [];
  } catch (error) {
    console.error("❌ Failed to fetch subcategories:", error);
    return [];
  }
}

// ==========================================================================
// OpenAI를 이용해 발화 내용을 csv의 특정 subcategory로 분류하기
async function identifySubcategoryWithGPT(text: string, subcategories: string[]): Promise<string | null> {
  const apiKey = process.env.AZURE_OPENAI_KEY!;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!;
  const deploymentName = "smu-team6-gpt-4o-mini"; 
  const apiVersion = "2024-02-15-preview";
  
  const url = `${endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

  const categoryListStr = subcategories.join(", ");

  const systemPrompt = `
    당신은 고객의 발언을 분석하여 법률적/규정적 카테고리로 분류하는 AI입니다.
    
    [목록]
    ${categoryListStr}

    [지시사항]
    1. 아래 제공되는 고객의 발언이 [목록] 중 어느 항목에 가장 부합하는지 판단하십시오.
    2. 답변은 반드시 [목록]에 있는 단어 중 하나여야 합니다.
    3. 만약 부합하는 것이 없다면 "Unknown"이라고 답하십시오.
    4. 설명 없이 결과 단어만 출력하십시오.
  `;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `고객 발화: "${text}"` }
        ],
        temperature: 0.1,
        max_tokens: 50
      }),
    });

    const data = await response.json();

    // 응답 상태 체크
    // 만약 콘텐츠 필터(Content Filter)로 인해 막혔다면 null을 반환하도록 처리
    if (!response.ok) {
      console.error("❌ OpenAI API Error:", JSON.stringify(data, null, 2));
      return null;
    }

    // 구조 방어 코드
    if (!data.choices || !data.choices[0]) {
        console.error("❌ Unexpected OpenAI Response:", JSON.stringify(data, null, 2));
        return null;
    }

    const result = data.choices[0].message.content.trim();
    
    // 결과가 목록에 있는지 검증
    if (subcategories.includes(result)) {
        return result;
    }
    
    console.warn(`⚠️ OpenAI returned unknown category: ${result}`);
    return null;

  } catch (error) {
    console.error("❌ OpenAI Classification Error:", error);
    return null;
  }
}

// ==========================================================================
// 분류된 Subcategory로 규정 검색 (Filter 사용)
async function searchRegulationByCategory(targetSubcategory: string): Promise<RegulationInfo | null> {
  const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT!;
  const searchKey = process.env.AZURE_SEARCH_KEY!;
  const indexName = "report-index";

  try {
    const searchClient = new SearchClient(searchEndpoint, indexName, new AzureKeyCredential(searchKey));

    // 텍스트 검색이 아닌 필터(Filter) 검색 사용
    // subcategory 필드가 정확히 targetSubcategory와 일치하는 문서를 찾음
    const searchResults = await searchClient.search("*", {
      top: 5, // 최대 5개 결과
      filter: `subcategory eq '${targetSubcategory.replace(/'/g, "''")}'`, // OData Filter 구문
      select: ["category", "subcategory", "regulation", "article", "content", "penalty"],
    });

    for await (const result of searchResults.results) {
      return {
        category: result.document.category as string,
        subcategory: result.document.subcategory as string,
        regulation: result.document.regulation as string,
        article: result.document.article as string,
        content: result.document.content as string,
        penalty: result.document.penalty as string,
        score: result.score
      };
    }
    return null;
  } catch (error) {
    console.error("🔍 Azure Search Error:", error);
    return null;
  }
}

// ==========================================================================
// Azure OpenAI 대응 가이드 생성 함수
async function generateResponseGuide(sttText: string, safetyResult: SafetyResponse): Promise<ResponseGuide | null> {
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
- 욕설·모욕·비하는 "심한 욕설", "모욕적인 표현", "공격적인 표현" 등으로 치환합니다.

톤 & 스타일 지침:
- 고객을 비난하거나 가르치는 느낌을 주지 않습니다.
- 책임을 떠넘기거나 방어적으로 들리는 표현을 사용하지 않습니다.
- 감정적인 표현은 사용하지 않습니다.
- 항상 차분하고 공손한 존댓말을 사용합니다.

출력 형식:
- 반드시 아래 JSON 형식만 출력합니다. JSON 외 텍스트 절대 금지.
{
  "situation": "객관적인 상황 요약 (1-2문장)",
  "current_action": "1단계: 지금 즉시 해야 할 행동",
  "current_script": "1단계에 맞는 응대 문구 (1-2문장)",
  "next_steps": ["2단계...", "3단계...", "4단계..."]
}`;

    const fetchOpenAI = async (inputText: string) => {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `고객 발화: ${inputText}` }
        ],
        temperature: 0.7,
        max_tokens: 600
      }),
    });
  };

  try {
    console.log("🤖 Generating guide (Attempt 1: Raw Text)...");
    let response = await fetchOpenAI(sttText);

    if (response.status === 400) {
      console.warn("⚠️ OpenAI blocked raw text (Content Filter). Retrying with sanitized description...");
      const detectedCategories = safetyResult.categoriesAnalysis
        .filter(c => c.severity > 0)
        .map(c => `${c.category} (Severity: ${c.severity})`)
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
    return JSON.parse(content);

  } catch (error) {
    console.error("Error generating guide:", error);
    return null;
  }

}



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

    // FFmpeg로 변환 (Promise로 래핑)
    await new Promise((resolve, reject) => {
      ffmpeg(tempInputPath!)
        .outputOptions(["-acodec pcm_s16le", "-ac 1", "-ar 16000"])
        .output(tempOutputPath!)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    // 변환된 WAV 파일 읽기
    const wavBuffer = await fs.readFile(tempOutputPath);

    // Azure Speech 설정 (PushStream)
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY!,
      process.env.AZURE_SPEECH_REGION!
    );
    speechConfig.speechRecognitionLanguage = "ko-KR"; // 한국어 설정

    // 1. PushStream 생성 (데이터를 밀어넣는 방식)
    const pushStream = sdk.AudioInputStream.createPushStream();
    // 2. 오디오 데이터를 스트림에 밀어넣음
    pushStream.write(wavBuffer.buffer);
    // 3. 스트림 닫기 (SDK에게 데이터가 끝났음을 명시적으로 알림)
    pushStream.close();
    // 4. Config에 스트림 연결
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

    // 결과 확인 및 반환
    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
      console.log("Recognition successful:", result.text);

      // ============================================================
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
          // STT 결과
          text: result.text,
          blocklistNames: [],
        }),
      });

      if (!safetyResponse.ok) {
        throw new Error(`Content Safety API Error: ${safetyResponse.statusText}`);
      }

      const safetyResult: SafetyResponse = await safetyResponse.json();

      // 유해성 판별
      const rejectThresholds: Record<Category, number> = {
        Hate: 2,
        SelfHarm: 2,
        Sexual: 2,
        Violence: 2,
      };

      let finalAction = "Accept";
      const actionDetails: Record<string, string> = {};

      // 카테고리별 점수 확인
      if (safetyResult.categoriesAnalysis) {
        for (const analysis of safetyResult.categoriesAnalysis) {
          const category = analysis.category;
          const severity = analysis.severity;
          const threshold = rejectThresholds[category];

          let action = "Accept";
          // 기준치 이상이면 Reject
          if (threshold !== -1 && severity >= threshold) {
            action = "Reject";
            finalAction = "Reject";
          }
          actionDetails[category] = action;
        }
      }

      // ============================================================
      // finalAction == "Reject"인 경우 OpenAI 가이드 생성 및 Search Service 규정 검색 수행
      let guideResult: ResponseGuide | null = null;
      let regulationResult: RegulationInfo | null = null;

      if (finalAction === "Reject") {
        console.log("🚨 Unsafe content detected. Starting analysis workflow...");

        // OpenAI 대응 가이드 생성
        const guidePromise = generateResponseGuide(result.text, safetyResult);

        // Search Service 규정 검색 프로세스 (Search Service 인덱스의 Subcategory 목록 조회 -> Azure OpenAI GPT 분류 -> 검색)
        const regulationPromise = (async () => {
            console.log("📂 Fetching subcategories from index...");
            // 1. 인덱스에 있는 모든 subcategory 종류를 가져옴
            const subcategories = await getAllSubcategories();
            
            if (subcategories.length > 0) {
                console.log(`🤖 Classifying text into: [${subcategories.join(", ")}]`);
                // 2. GPT를 통해 텍스트가 어떤 subcategory인지 판단
                const detectedSubcategory = await identifySubcategoryWithGPT(result.text, subcategories);
                
                if (detectedSubcategory) {
                    console.log(`✅ Identified Subcategory: "${detectedSubcategory}"`);
                    // 3. 해당 subcategory로 규정 문서 검색 (Filter)
                    return await searchRegulationByCategory(detectedSubcategory);
                } else {
                    console.warn("⚠️ GPT could not classify the subcategory.");
                    return null;
                }
            } else {
                console.warn("⚠️ No subcategories found in the index.");
                return null;
            }
        })();

        // 두 작업을 병렬로 처리하여 속도 최적화
        const [guide, regulation] = await Promise.all([guidePromise, regulationPromise]);
        
        guideResult = guide;
        regulationResult = regulation;

        // 가이드 데이터 포맷팅
        if (guideResult) {
          if (guideResult.current_action) guideResult.current_action = guideResult.current_action.replace(/^\d+단계:\s*/, '').trim();
          if (guideResult.next_steps) guideResult.next_steps = guideResult.next_steps.map(step => step.replace(/^\d+단계:\s*/, '').trim());
        }
      }

      // ============================================================
      const responsePayload = {
        text: result.text,
        safetyDecision: finalAction,
        safetyDetails: actionDetails,
        rawSafetyResult: safetyResult,
        guide: guideResult,
        regulation: regulationResult 
      };

      // JSON 출력
      console.log("📦 Final JSON Response:\n", JSON.stringify(responsePayload, null, 2));

      // 클라이언트에게 반환
      return NextResponse.json(responsePayload);
      // ============================================================
      
    } else if (result.reason === sdk.ResultReason.NoMatch) {
      console.log("No speech could be recognized");
      return NextResponse.json({ text: "", error: "No speech recognized" });
    } else if (result.reason === sdk.ResultReason.Canceled) {
      const cancellation = sdk.CancellationDetails.fromResult(result);
      console.error("Recognition canceled:", cancellation.reason);
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
    console.error("Error in speech recognition:", error);
    return NextResponse.json(
      {
        error: "Failed to process audio",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    // 임시 파일 삭제
    if (tempInputPath) {
      await fs.unlink(tempInputPath).catch(console.error);
    }
    if (tempOutputPath) {
      await fs.unlink(tempOutputPath).catch(console.error);
    }
  }
}
