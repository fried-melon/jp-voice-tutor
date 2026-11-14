export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export function status(text: string) { $('status').textContent = text; }
export function timeLabel(seconds: number) { return `${Math.floor(seconds / 60).toString().padStart(2,'0')}:${(seconds % 60).toString().padStart(2,'0')}`; }
export function addTranscript(role: string, text: string, append: boolean) {
 const box = $('transcript');
 let p = box.lastElementChild as HTMLElement | null;
 if (!append || p?.dataset.role !== role) { p = document.createElement('p'); p.dataset.role = role; box.append(p); }
 p.textContent = (p.textContent || '') + text;
 box.scrollTop = box.scrollHeight;
}

export const TRANSCRIPT_EMPTY = '연습을 시작하면 일본어와 한국어 피드백이 여기에 보여요.';
export function resetTranscript() {
 const box = $('transcript');
 box.replaceChildren();
 const p = document.createElement('p');
 p.className = 'empty';
 p.textContent = TRANSCRIPT_EMPTY;
 box.append(p);
}
