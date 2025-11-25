import { NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";

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
      return NextResponse.json({ text: result.text });
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
