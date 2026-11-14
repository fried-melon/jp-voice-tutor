export const MODEL:string;
export function lessonPrompt(prompt:string,lesson:unknown,nickname?:string):string;
export function liveConfig(prompt:string,mode?:string):Record<string,unknown>;
export function liveSetup(prompt:string,mode?:string):Record<string,unknown>;
