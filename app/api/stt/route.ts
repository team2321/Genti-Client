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

/////////
// 👇 [추가 2] fluent-ffmpeg에게 "실행 파일은 여기에 있어!"라고 알려줍니다.
if (ffmpegInstaller) {
  ffmpeg.setFfmpegPath(ffmpegInstaller);
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
/////////



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


      /////////
      // ============================================================
      // 🚀 [통합 부분] 여기서 Content Safety API를 호출합니다.
      // Python 코드의 requests.post 로직을 fetch로 변환했습니다.
      // ============================================================
      
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
          // text: recognizedText, // STT 결과가 여기로 들어갑니다!
          text: result.text, // STT 결과가 여기로 들어갑니다!
          blocklistNames: [],
        }),
      });

      if (!safetyResponse.ok) {
        throw new Error(`Content Safety API Error: ${safetyResponse.statusText}`);
      }

      const safetyResult: SafetyResponse = await safetyResponse.json();

      // [심판 로직] Python의 make_decision 함수 로직 구현
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
      return NextResponse.json({
        // text: recognizedText,
        text: result.text,
        safetyDecision: finalAction, // "Accept" 또는 "Reject"
        safetyDetails: actionDetails, // 각 항목별 결과
        rawSafetyResult: safetyResult // (디버깅용) 원본 데이터
      });
      /////////



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
