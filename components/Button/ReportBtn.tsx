"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { toast } from "react-toastify";

interface Regulation {
  category: string;
  subcategory: string;
  regulation: string;
  article: string;
  content: string;
  penalty: string;
  score: number;
}

export default function ReportBtn({
  audioFile,
  onClearAudio,
  regulation,
  text,
}: {
  audioFile?: File | null;
  onClearAudio?: () => void;
  regulation?: Regulation | null;
  text?: string | null;
}) {
  const [details, setDetails] = useState("");

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Create object URL for audio preview
  useEffect(() => {
    if (audioFile) {
      const url = URL.createObjectURL(audioFile);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAudioUrl(null);
  }, [audioFile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submittedMsg = "법무팀에게 신고가 제출되었습니다.";
    toast.info(submittedMsg, { containerId: "agent-toast" });
    toast.info(submittedMsg, { containerId: "customer-toast" });
    onClearAudio?.();
  };

  return (
    <div>
      <Dialog>
        <DialogTrigger asChild>
          <button className="bg-[#5F5F5F] px-4 py-2 text-white rounded-lg text-base font-bold cursor-pointer hover:bg-[#525151]">
            신고하기
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>신고하기</DialogTitle>
            <DialogDescription>
              해당 통화의 문제점을 신고합니다. 가능한 구체적으로 작성해주세요.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col">
              <label className="text-sm font-semibold">신고 유형</label>
            </div>

            {/* Transcribed text display */}
            {text && (
              <div className="flex flex-col">
                <label className="text-sm font-semibold mb-2">발언 내용</label>
                <div className="bg-gray-50 border border-gray-300 rounded-md p-3 text-sm text-gray-700 max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            )}

            {/* Regulation info card - show if available */}
            {regulation && (
              <div className="bg-[#FFF9E6] border border-[#FFE4A3] rounded-lg p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-2 h-2 rounded-full bg-[#F59E0B] mt-1.5" />
                  <div className="flex-1">
                    <div className="flex gap-2 items-center mb-1">
                      <span className="text-xs font-bold text-[#92400E] bg-[#FDE68A] px-2 py-0.5 rounded">
                        {regulation.regulation}
                      </span>
                      <span className="text-xs font-semibold text-[#92400E]">
                        {regulation.subcategory}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed mb-2">
                      {regulation.content}
                    </p>
                    {regulation.penalty && regulation.penalty !== "-" && (
                      <div className="text-xs text-[#92400E] bg-[#FEF3C7] px-2 py-1 rounded inline-block">
                        <span className="font-semibold">처벌: </span>
                        {regulation.penalty}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col">
              <label className="text-sm font-semibold mb-1">상세 내용</label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="상세 내용을 입력하세요 (선택)"
              />
            </div>

            {audioUrl && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold">첨부된 녹음</label>
                <audio controls src={audioUrl} className="w-full rounded-md" />
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">{audioFile?.name}</div>
                  <button
                    type="button"
                    onClick={() => onClearAudio?.()}
                    className="text-sm text-red-600 underline"
                  >
                    제거
                  </button>
                </div>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded-md bg-gray-200 text-sm font-medium"
                >
                  취소
                </button>
              </DialogClose>
              <DialogClose asChild>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-md bg-[#C4F15A] text-gray-900 font-bold"
                >
                  제출
                </button>
              </DialogClose>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
