import { NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
/////////
import ffmpegInstaller from "ffmpeg-static";
/////////
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";

// ==========================================================================
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

    // Azure Speech 설정
    const speechConfig = sdk.SpeechConfig.fromSubscription(
      process.env.AZURE_SPEECH_KEY!,
      process.env.AZURE_SPEECH_REGION!
    );
    speechConfig.speechRecognitionLanguage = "ko-KR"; // 한국어 설정

    // WAV 버퍼를 Azure Speech SDK에 전달
    const audioConfig = sdk.AudioConfig.fromWavFileInput(wavBuffer);
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
          // text: recognizedText,
          text: result.text,
          blocklistNames: [],
        }),
      });

      if (!safetyResponse.ok) {
        throw new Error(`Content Safety API Error: ${safetyResponse.statusText}`);
      }

      const safetyResult: SafetyResponse = await safetyResponse.json();

      const rejectThresholds: Record<Category, number> = {
        Hate: 4,
        SelfHarm: 4,
        Sexual: 4,
        Violence: 4,
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

      // 최종 응답 반환
      const responsePayload = {
        text: result.text,
        // Accept / Reject
        safetyDecision: finalAction,
        // 카테고리별 결과
        safetyDetails: actionDetails,
        // 원본 data
        rawSafetyResult: safetyResult
      };

      // JSON 출력
      console.log("📦 Final JSON Response:\n", JSON.stringify(responsePayload, null, 2));

      // 클라이언트에게 반환
      return NextResponse.json(responsePayload);
      // ============================================================

      // return NextResponse.json({ text: result.text });
      
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
