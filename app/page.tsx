"use client";

import { useRef, useState, useEffect } from "react";
import { Square, Settings } from "lucide-react";
import { FaMicrophone } from "react-icons/fa";

interface Message {
  id: string;
  text: string;
  isUser: boolean; // true = 상담원(오른쪽), false = 고객(왼쪽)
  timestamp: Date;
}

export default function GentiChatInterface() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false); // 녹음 진행 중 상태
  const [messages, setMessages] = useState<Message[]>([]); // 대화 내용 저장
  const [isProcessing, setIsProcessing] = useState(false); // 음성 -> 텍스트 변환 진행 중 상태
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 새로운 메시지 생성에 따라 스크롤 내려가기
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        setIsProcessing(true);
        const audioBlob = new Blob(chunks, { type: "audio/webm" });

        const form = new FormData();
        form.append("file", audioBlob, "audio.webm");

        try {
          // Send to backend for Azure STT
          const res = await fetch("/api/stt", {
            method: "POST",
            body: form,
          });

          const data = await res.json();

          if (data.text) {
            // Add customer message (고객 메시지 - 왼쪽)
            const customerMessage: Message = {
              id: Date.now().toString(),
              text: data.text,
              isUser: false, // false = 고객 (왼쪽에 표시)
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, customerMessage]);

            // TODO: 실제 상담원 AI 응답으로 교체
            // Simulate agent response (상담원 응답 - 오른쪽)
            setTimeout(() => {
              const agentMessage: Message = {
                id: (Date.now() + 1).toString(),
                text: "이곳에 대응 스크립트 표시",
                isUser: true, // true = 상담원 (오른쪽에 표시)
                timestamp: new Date(),
              };
              setMessages((prev) => [...prev, agentMessage]);
            }, 1000);
          }
        } catch (error) {
          console.error("Error processing audio:", error);
        } finally {
          setIsProcessing(false);
        }

        // Stop all tracks
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
    <div className="flex h-screen bg-gray-900">
      {/* Left Panel - Recording Interface (고객 음성 입력) */}
      <div className="flex-1 bg-[#C4F15A] flex flex-col items-center justify-center relative">
        {/* Logo */}
        <div className="absolute top-8 left-8">
          <h1 className="text-4xl font-bold text-gray-900">Logo</h1>
        </div>

        {/* Microphone Button */}
        <div className="relative">
          {/* Pulse animation when recording */}
          {recording && (
            <>
              <div className="absolute inset-0 rounded-full bg-white/30 animate-ping" />
              <div className="absolute inset-0 rounded-full bg-white/20 animate-ping animation-delay-200" />
            </>
          )}

          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={isProcessing}
            className={`
              relative z-10 w-32 h-32 rounded-full flex items-center justify-center
              transition-all duration-300 transform hover:scale-105
              ${
                recording
                  ? "bg-[#B0D854] hover:bg-white"
                  : "bg-[#D5FF74] hover:bg-white"
              }
              ${
                isProcessing
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer"
              }
            `}
          >
            {recording ? (
              <Square className="w-12 h-12 text-[#D5FF74]" fill="#D5FF74" />
            ) : (
              <FaMicrophone className="w-12 h-12 text-[#B0D854]" />
            )}
          </button>
        </div>

        {/* Status Text */}
        <div className="mt-8 text-center">
          <p className="text-lg font-medium text-gray-800">
            {isProcessing
              ? "처리 중..."
              : recording
              ? "고객님의 말씀을 듣고 있어요..."
              : "마이크를 눌러 고객 음성을 입력하세요"}
          </p>
        </div>

        {/* Visual feedback */}
        {recording && (
          <div className="mt-6 flex space-x-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-gray-800 rounded-full animate-pulse"
                style={{
                  height: `${20 + Math.random() * 30}px`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: "0.8s",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right Panel - Chat Interface (고객-상담원 대화) */}
      <div className="flex-1 bg-gray-800 flex flex-col">
        {/* Chat Header */}
        <div className="bg-gray-900 px-6 py-4 flex items-center justify-between border-b border-gray-700">
          <div>
            <h2 className="text-white text-lg font-medium">고객 상담 채팅</h2>
            <p className="text-gray-400 text-xs mt-1">
              고객 음성 → 상담원 응답
            </p>
          </div>
          <button className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
            <Settings className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500 text-center">
                마이크 버튼을 눌러
                <br />
                고객 음성을 입력하세요
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.isUser ? "justify-end" : "justify-start"
                }`}
              >
                <div className="flex flex-col">
                  {/* Role Label */}
                  <span
                    className={`text-xs text-gray-400 mb-1 ${
                      message.isUser ? "text-right mr-2" : "ml-2"
                    }`}
                  >
                    {message.isUser ? "상담원" : "고객"}
                  </span>

                  {/* Message Bubble */}
                  <div
                    className={`
                       px-4 py-3 rounded-2xl
                      ${
                        message.isUser
                          ? "bg-blue-600 text-white rounded-br-md" // 상담원 (오른쪽, 파란색)
                          : "bg-gray-700 text-gray-100 rounded-bl-md" // 고객 (왼쪽, 회색)
                      }
                    `}
                  >
                    <p className="text-sm">{message.text}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {message.timestamp.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="px-6 py-3 border-t border-gray-700">
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-100" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-200" />
              </div>
              <span className="text-gray-400 text-sm">음성 인식 중...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
