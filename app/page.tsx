"use client";

import { useRef, useState, useEffect } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Image from "next/image";
import RecordBtn from "@/components/Button/RecordBtn";
import ReportBtn from "@/components/Button/ReportBtn";
import { RiErrorWarningFill } from "react-icons/ri";

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

const responseGuideMock = {
  situation:
    "고객이 심한 욕설을 사용하며 배송 지연에 대해 강하게 불만을 표현하고 있습니다.",
  current_action: "1단계: 고객 감정 인정 및 사과",
  current_script:
    "배송 지연으로 많이 불편하셨을 것 같습니다. 먼저 불편을 겪게 해드린 점 진심으로 사과드립니다.",
  next_steps: [
    "2단계: 배송 조회 시스템 즉시 확인",
    "3단계: 구체적 배송 예정일 안내",
    "4단계: 필요시 보상 방안 제시",
  ],
};

export default function GentiChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [callTime, setCallTime] = useState("00:02");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const agent_msg =
        "공격적인 발언 감지\n고객님께 발언에 대한 신중성을 안내했습니다.";
      const customer_msg =
        "공격적인 표현이 감지되었습니다.\n차분하게 대화를 이어나가주세요.";

      // Show same warning in both agent and customer view containers
      toast.warning(agent_msg, {
        containerId: "agent-toast",
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });

      toast.warning(customer_msg, {
        containerId: "customer-toast",
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: true,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleTranscription = (text: string) => {
    const customerMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: false,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, customerMessage]);

    // 임시 상담원 응답
    setTimeout(() => {
      const agentMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: "이곳에 대응 스크립트 표시",
        isUser: true,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, agentMessage]);
    }, 1000);
  };

  return (
    <div className="flex h-screen bg-[#373737] grid grid-cols-[2fr_1fr]">
      {/* Floating Mic Button - Bottom Left */}
      <RecordBtn
        onTranscription={handleTranscription}
        setIsProcessing={setIsProcessing}
      />

      {/* Agent View */}
      <div className="flex flex-col h-full">
        {/* Toast container for Agent view (positioned near left-column center) */}
        <ToastContainer
          containerId="agent-toast"
          position="top-center"
          autoClose={3000}
          hideProgressBar
          closeOnClick={false}
          draggable
          toastClassName={() =>
            "min-w-[360px] rounded-xl bg-white text-[#333] shadow-lg border border-[#E5E5E5] px-4 py-3 flex items-start space-x-3"
          }
          // bodyClassName={() => "text-sm font-semibold"}
          icon={<RiErrorWarningFill className="text-[#C4F15A] text-4xl" />}
          className="absolute left-[33%] transform -translate-x-1/2 whitespace-pre-line text-sm font-bold"
        />
        {/* Header */}
        <div className="bg-[#373737] px-6 py-4 border-b border-[#939393] fixed w-full">
          <Image src="/genti-logo.svg" alt="logo" width={80} height={40} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-10 min-h-full flex flex-col items-center justify-center">
          <div className="max-w-3xl w-full">
            {/* Title */}
            <div>
              <p className="text-[#C4F15A] text-base font-bold mb-6">
                상황 요약
              </p>
              <p className="text-white text-lg leading-relaxed font-semibold">
                {responseGuideMock.situation}
              </p>
            </div>

            {/* Step by step guidance - 가로 배열로 변경 */}
            <div className="flex mt-15 justify-between">
              <div>
                <p className="text-[#C4F15A] text-base font-bold">
                  단계별 대응 요령 안내
                </p>
                <span className="text-[#B3B3B3] text-sm font-bold flex items-center space-x-1">
                  <RiErrorWarningFill className="text-[#B3B3B3]" />
                  <span>신고 가능한 발언입니다.</span>
                </span>
              </div>
              <ReportBtn
                audioFile={recordedFile}
                onClearAudio={() => setRecordedFile(null)}
              />
            </div>
            <div className="relative pt-6">
              <div className="absolute left-[11px] top-14 bottom-2 w-0.5 bg-[#C4F15A]"></div>
              <div className="space-y-8">
                {/* 1. 현재 단계 (NOW) - current_action, current_script 적용 */}
                <div className="relative flex items-start">
                  <div className="ml-5 flex pt-0.5 items-center">
                    {/* current_action 적용 */}
                    <div className="-ml-5 flex-shrink-0 w-6 h-6 rounded-full bg-[#C4F15A] z-10 "></div>
                    <div className="pl-4">
                      <div className="bg-[#C4F15A] text-gray-900 text-xs font-bold px-1 py-0.5 rounded w-fit">
                        NOW
                      </div>
                      <p className="text-lg text-white font-bold">
                        {responseGuideMock.current_action}
                      </p>
                    </div>
                    {/* current_script 적용 */}
                    <div className="ml-5 mt-2 p-4 bg-[#C4F15A] text-gray-900 rounded-lg relative before:content-[''] before:absolute before:right-full before:top-7 before:border-8 before:border-transparent before:border-r-[#C4F15A] max-w-sm text-sm font-semibold">
                      {responseGuideMock.current_script}
                    </div>
                  </div>
                </div>

                {/* 2. 다음 단계들 - next_steps 배열을 map으로 처리하여 반복 생성 */}
                {responseGuideMock.next_steps.map((step, index) => (
                  <div key={index} className="relative flex items-start">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#C4F15A] z-10 mt-1"></div>
                    <div className="ml-5 flex-1 pt-0.5">
                      {/* step (배열의 각 요소) 적용 */}
                      <p className="text-lg font-semibold text-gray-200">
                        {step}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Customer view */}
      <div className="flex-1 bg-gray-700 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Toast container for Customer view (positioned near right-column center) */}
        <ToastContainer
          containerId="customer-toast"
          position="top-center"
          autoClose={3000}
          hideProgressBar
          pauseOnHover
          draggable
          toastClassName={() =>
            "min-w-[360px] rounded-2xl bg-[#4A4A4A] text-white px-5 py-4 shadow-md flex items-start space-x-3"
          }
          icon={<RiErrorWarningFill className="text-[#FFCC4D] text-4xl" />}
          className="customer-toast-container whitespace-pre-line text-sm font-bold"
          progressClassName="!bg-white"
          style={{
            left: "83.33%",
            transform: "translateX(-50%)",
          }}
        />
        <Image src="/call.png" width={80} height={160} alt="Call interface" />
      </div>
    </div>
  );
}
