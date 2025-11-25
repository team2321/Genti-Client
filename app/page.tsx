"use client";

import { useRef, useState } from "react";

export default function STTTest() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState("");

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 기본 webm 타입
    const recorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus",
    });
    mediaRecorderRef.current = recorder;

    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      chunks.push(e.data);
    };

    recorder.onstop = async () => {
      const audioBlob = new Blob(chunks, { type: "audio/webm" });

      const form = new FormData();
      form.append("file", audioBlob, "audio.webm");

      // 백엔드에 전송 → Azure STT 호출
      const res = await fetch("/api/stt", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      setResult(data.text || "(인식 실패)");
    };

    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  return (
    <div className="p-6">
      <h1>🎤 Azure Speech-to-Text Test (webm)</h1>

      {recording ? (
        <button onClick={stopRecording}>⏹ 녹음 종료</button>
      ) : (
        <button onClick={startRecording}>🎙 녹음 시작</button>
      )}

      <h2 className="mt-4">결과:</h2>
      <div>{result}</div>
    </div>
  );
}
