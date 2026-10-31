// Web Worker dựng lưới tượng Phật ngoài luồng chính: nhận { part, detail, curls? }, trả lưới phần đó (+ tóc xoắn ốc nếu
// được hỏi) dưới dạng mảng số chuyển quyền, không sao chép.
import { buildBuddhaCurls, buildBuddhaPart, type BuddhaMeshData, type BuddhaPart } from './buddhaSdf';

export interface BuddhaJob {
  part: BuddhaPart;
  detail: number;
  curls?: boolean;
}

export interface BuddhaJobResult {
  part: BuddhaPart;
  mesh: BuddhaMeshData;
  curls?: Float32Array;
}

const post = (m: BuddhaJobResult, transfer: Transferable[]) =>
  (self as unknown as { postMessage(m: unknown, transfer: Transferable[]): void }).postMessage(m, transfer);

self.onmessage = (e: MessageEvent<BuddhaJob>) => {
  const { part, detail, curls } = e.data;
  const mesh = buildBuddhaPart(part, detail);
  const transfer: Transferable[] = [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.index.buffer];
  const res: BuddhaJobResult = { part, mesh };
  if (curls) {
    res.curls = buildBuddhaCurls();
    transfer.push(res.curls.buffer);
  }
  post(res, transfer);
};
