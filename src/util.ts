export const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
export const dump = (a: any) => JSON.stringify(a, null, 3);
