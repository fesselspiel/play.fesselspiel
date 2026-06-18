declare module "qrcode" {
  const QRCode: {
    toString(text: string, options: { type: "svg"; margin?: number; width?: number; color?: Record<string, string> }): Promise<string>;
  };
  export default QRCode;
}
