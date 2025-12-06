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

export default function ReportBtn({
  audioFile,
  onClearAudio,
}: {
  audioFile?: File | null;
  onClearAudio?: () => void;
}) {
  const [reason, setReason] = useState("policy");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Create object URL for audio preview
  useEffect(() => {
    if (audioFile) {
      const url = URL.createObjectURL(audioFile);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setAudioUrl(null);
  }, [audioFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const form = new FormData();
      form.append("reason", reason);
      form.append("details", details);
      if (audioFile) form.append("file", audioFile, audioFile.name);

      // Attempt to send to API endpoint `/api/report` (implement server-side separately)
      const res = await fetch("/api/report", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        throw new Error("Failed to submit report");
      }

      toast.success("신고가 접수되었습니다.", { containerId: "agent-toast" });
      toast.info("신고가 접수되었습니다.", { containerId: "customer-toast" });
      // Clear parent-stored audio if callback provided
      onClearAudio?.();
    } catch (err) {
      console.error(err);
      toast.error("신고 접수에 실패했습니다.", { containerId: "agent-toast" });
    } finally {
      setIsSubmitting(false);
    }
    // Close handled by DialogClose on the button
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
              <label className="text-sm font-semibold mb-1">신고 유형</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="rounded-md border px-3 py-2 bg-white text-sm"
              >
                <option value="policy">정책 위반 (욕설/혐오 발언)</option>
                <option value="harassment">괴롭힘/위협</option>
                <option value="fraud">사기/오도</option>
                <option value="other">기타</option>
              </select>
            </div>

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
