declare module 'chrome-aws-lambda' {
  export const args: string[];
  export const defaultViewport: {
    width: number;
    height: number;
  };
  export const executablePath: Promise<string>;
  export const headless: boolean;
  export const puppeteer: any;
}
