"use client";

import { useState, useEffect } from "react";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Image from "next/image";
import RecordBtn from "@/components/Button/RecordBtn";
import ReportBtn from "@/components/Button/ReportBtn";
import { RiErrorWarningFill } from "react-icons/ri";
import { SyncLoader } from "react-spinners";

interface ResponseGuide {
  situation: string;
  current_action: string;
  current_script: string;
  next_steps: string[];
}

export default function GentiChatInterface() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [responseGuide, setResponseGuide] = useState<ResponseGuide | null>(
    null
  );

  const handleTranscription = (text: string, guide?: ResponseGuide | null) => {
    // If backend returned a guide, set it and show the warning toasts
    if (guide) {
      setResponseGuide(guide);

      const agent_msg =
        "공격적인 발언 감지\n고객님께 발언에 대한 신중성을 안내했습니다.";
      const customer_msg =
        "공격적인 표현이 감지되었습니다.\n차분하게 대화를 이어나가주세요.";

      // Show warnings when guide is generated
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
    }
  };

  return (
    <div className="flex h-screen bg-[#373737] grid grid-cols-[2fr_1fr]">
      {/* Floating Mic Button - Bottom Left */}
      <RecordBtn
        onTranscription={handleTranscription}
        setIsProcessing={setIsProcessing}
        onAudio={(f) => setRecordedFile(f)}
      />

      {/* Agent View */}
      <div className="flex flex-col h-full">
        {/* Toast container for Agent view */}
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
          icon={<RiErrorWarningFill className="text-[#C4F15A] text-4xl" />}
          className="absolute left-[33%] transform -translate-x-1/2 whitespace-pre-line text-sm font-bold"
        />

        {/* Header */}
        <div className="bg-[#373737] px-6 py-4 border-b border-[#939393] fixed w-full">
          <Image src="/genti-logo.svg" alt="logo" width={80} height={40} />
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-10 min-h-full flex flex-col items-center justify-center relative">
          {/* Loading overlay */}
          {isProcessing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="flex flex-col items-center gap-4">
                <SyncLoader color="#C4F15A" />
                <div className="text-white font-semibold">
                  음성 인식 및 응답 생성 중...
                </div>
              </div>
            </div>
          )}

          {/* Only show content if responseGuide exists */}
          {responseGuide ? (
            <div className="max-w-3xl w-full">
              {/* Title */}
              <div>
                <p className="text-[#C4F15A] text-base font-bold mb-6">
                  상황 요약
                </p>
                <p className="text-white text-lg leading-relaxed font-semibold">
                  {responseGuide.situation}
                </p>
              </div>

              {/* Step by step guidance */}
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
                  {/* Current step (NOW) */}
                  <div className="relative flex items-start">
                    <div className="ml-5 flex pt-0.5 items-center">
                      <div className="-ml-5 flex-shrink-0 w-6 h-6 rounded-full bg-[#C4F15A] z-10"></div>
                      <div className="pl-4">
                        <div className="bg-[#C4F15A] text-gray-900 text-xs font-bold px-1 py-0.5 rounded w-fit">
                          NOW
                        </div>
                        <p className="text-lg text-white font-bold">
                          {responseGuide.current_action}
                        </p>
                      </div>
                      <div className="ml-5 mt-2 p-4 bg-[#C4F15A] text-gray-900 rounded-lg relative before:content-[''] before:absolute before:right-full before:top-7 before:border-8 before:border-transparent before:border-r-[#C4F15A] max-w-sm text-sm font-semibold">
                        {responseGuide.current_script}
                      </div>
                    </div>
                  </div>

                  {/* Next steps */}
                  {responseGuide.next_steps.map((step, index) => (
                    <div key={index} className="relative flex items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#C4F15A] z-10 mt-1"></div>
                      <div className="ml-5 flex-1 pt-0.5">
                        <p className="text-lg font-semibold text-gray-200">
                          {step}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Empty state - show nothing except placeholder message */
            <div className="flex flex-col items-center justify-center text-gray-500">
              <p className="text-lg">상담을 듣는 중..</p>
            </div>
          )}
        </div>
      </div>

      {/* Customer view */}
      <div className="flex-1 bg-gray-700 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Toast container for Customer view */}
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
