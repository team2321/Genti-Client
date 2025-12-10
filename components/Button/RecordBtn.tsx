import { FaMicrophone, FaStop } from "react-icons/fa";
import { useRef, useState } from "react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onTranscription?: (text: string, guide?: any, regulation?: any) => void;
  setIsProcessing?: (v: boolean) => void;
  onAudio?: (file: File | null) => void;
  testTextInput?: string;
  onTestTextInputChange?: (value: string) => void;
  onTestTextSubmit?: () => void;
  isProcessing?: boolean;
}

export default function RecordBtn({
  onTranscription,
  setIsProcessing,
  onAudio,
  testTextInput = "",
  onTestTextInputChange,
  onTestTextSubmit,
  isProcessing = false,
}: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      mediaRecorderRef.current = recorder;

      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        setIsProcessingLocal(true);
        if (setIsProcessing) setIsProcessing(true);
        const audioBlob = new Blob(chunks, { type: "audio/webm" });

        // Provide the raw recorded file to parent if requested
        try {
          const audioFile = new File([audioBlob], "recording.webm", {
            type: "audio/webm",
          });
          onAudio?.(audioFile);
        } catch {
          // fallback: if File constructor not available
          onAudio?.(null);
        }

        const form = new FormData();
        form.append("file", audioBlob, "audio.webm");

        try {
          const res = await fetch("/api/stt", {
            method: "POST",
            body: form,
          });

          const data = await res.json();

          if (data) {
            // data may contain { text, guide, regulation, ... }
            onTranscription?.(
              data.text ?? "",
              data.guide ?? null,
              data.regulation ?? null
            );
          }
        } catch (error) {
          console.error("Error processing audio:", error);
        } finally {
          setIsProcessingLocal(false);
          if (setIsProcessing) setIsProcessing(false);
        }

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("마이크 접근 권한이 필요합니다.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      setRecording(false);
    }
  };

  return (
    <div className="absolute bottom-8 left-8 z-20 flex gap-3 items-center">
      <button
        onClick={recording ? stopRecording : startRecording}
        disabled={isProcessingLocal}
        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110 flex-shrink-0 ${
          recording
            ? "bg-red-500 hover:bg-red-600"
            : "bg-[#C4F15A] hover:bg-[#D5FF74]"
        } ${
          isProcessingLocal ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } shadow-lg`}
      >
        {recording ? (
          <FaStop className="w-6 h-6 text-white" fill="white" />
        ) : (
          <FaMicrophone className="w-6 h-6 text-[#373737]" />
        )}
      </button>

      {/* Test Text Input (Dev Mode) */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={testTextInput}
          onChange={(e) => onTestTextInputChange?.(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter") onTestTextSubmit?.();
          }}
          placeholder="테스트 텍스트 입력..."
          className="px-3 py-2 text-sm border border-[#C4F15A] bg-[#2a2a2a] text-white rounded-md focus:outline-none focus:ring-2 focus:ring-[#C4F15A]"
        />
        <button
          onClick={onTestTextSubmit}
          disabled={isProcessing || !testTextInput.trim()}
          className="px-3 py-2 text-sm bg-[#C4F15A] text-gray-900 font-bold rounded-md hover:bg-[#b8e64a] disabled:opacity-50 cursor-pointer flex-shrink-0"
        >
          전송
        </button>
      </div>
    </div>
  );
}
