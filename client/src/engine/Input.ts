// Bàn phím + chuột: trạng thái phím đang giữ, khóa chuột (pointer lock) để xoay góc nhìn.
export interface InputHandlers {
  key(e: KeyboardEvent, down: boolean): void;
  look(dx: number, dy: number): void;
  wheel(dy: number): void;
  lockChange(locked: boolean): void;
  /** Bấm chuột trái/phải khi đang khóa chuột. */
  mouse(button: number, down: boolean): void;
}

/** Phím mà trình duyệt có hành vi mặc định gây phiền (cuộn trang, đổi focus). */
const BLOCK_DEFAULT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote']);

export class Input {
  private readonly downKeys = new Set<string>();
  locked = false;
  private lastLockExit = 0;

  private readonly onKeyDown = (e: KeyboardEvent) => this.handleKey(e, true);
  private readonly onKeyUp = (e: KeyboardEvent) => this.handleKey(e, false);
  private readonly onMove = (e: MouseEvent) => {
    if (this.locked) this.handlers.look(e.movementX, e.movementY);
  };
  private readonly onWheel = (e: WheelEvent) => {
    if (this.locked) this.handlers.wheel(e.deltaY);
  };
  private readonly onLockChange = () => {
    const locked = document.pointerLockElement === this.canvas;
    if (!locked && this.locked) this.lastLockExit = performance.now();
    this.locked = locked;
    this.handlers.lockChange(locked);
  };
  private readonly onBlur = () => {
    // Mất focus thì thả mọi phím (tránh nhân vật chạy mãi).
    for (const code of [...this.downKeys]) {
      this.downKeys.delete(code);
      this.handlers.key(new KeyboardEvent('keyup', { code }), false);
    }
  };
  private readonly onMouseDown = (e: MouseEvent) => {
    if (this.locked) {
      e.preventDefault();
      this.handlers.mouse(e.button, true);
    }
  };
  private readonly onMouseUp = (e: MouseEvent) => {
    if (this.locked) this.handlers.mouse(e.button, false);
  };
  private readonly onContext = (e: MouseEvent) => e.preventDefault();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly handlers: InputHandlers,
  ) {
    addEventListener('keydown', this.onKeyDown);
    addEventListener('keyup', this.onKeyUp);
    addEventListener('blur', this.onBlur);
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: true });
    canvas.addEventListener('contextmenu', this.onContext);
  }

  isDown(code: string): boolean {
    return this.downKeys.has(code);
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (typing) {
      // Đang gõ chữ: không giữ phím di chuyển; Esc/Enter vẫn chuyển cho game xử lý ô chat.
      this.downKeys.clear();
      if (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    } else {
      if (down) this.downKeys.add(e.code);
      else this.downKeys.delete(e.code);
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    }
    this.handlers.key(e, down);
  }

  /** Khóa chuột vào canvas (cần cú bấm/phím của người dùng). Trả false nếu trình duyệt từ chối. */
  requestLock(): void {
    if (this.locked) return;
    // Chrome từ chối khóa lại ngay sau khi thoát bằng Esc (~1 giây).
    if (performance.now() - this.lastLockExit < 1100) return;
    try {
      const r = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      // Bỏ qua: hiện gợi ý "Bấm vào màn hình".
    }
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  dispose(): void {
    removeEventListener('keydown', this.onKeyDown);
    removeEventListener('keyup', this.onKeyUp);
    removeEventListener('blur', this.onBlur);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContext);
    this.exitLock();
  }
}
