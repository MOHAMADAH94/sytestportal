import { QRCodeCanvas } from 'qrcode.react'

const LOGO = '/logo.png'

type Props = {
  value: string
  size?: number
  className?: string
}

export function BrandedQrCode({ value, size = 148, className = '' }: Props) {
  // شعار متناسق مع هامش أمان قياسي لضمان سرعة مسح الكاميرا
  const logoSize = Math.min(22, Math.max(14, Math.round(size * 0.14)))

  return (
    <div
      className={`qr-print-safe relative inline-flex items-center justify-center overflow-hidden rounded-3xl border-2 border-gold/55 bg-white p-3.5 shadow-[0_0_28px_rgba(193,165,118,0.28)] print:rounded-xl print:border print:border-black print:bg-white print:p-2 print:shadow-none ${className}`}
      style={{
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        backgroundColor: '#ffffff',
        width: size + 28,
        height: size + 28,
      }}
    >
      <QRCodeCanvas
        value={value}
        size={size}
        level="Q"
        marginSize={4}
        bgColor="#ffffff"
        fgColor="#000000"
        imageSettings={{
          src: LOGO,
          height: logoSize,
          width: logoSize,
          excavate: true,
        }}
        style={{
          width: size,
          height: size,
          maxWidth: size,
          maxHeight: size,
          display: 'block',
        }}
      />
    </div>
  )
}
