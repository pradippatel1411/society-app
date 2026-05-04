import { useRef, useEffect } from "react"

type Props = {
  value: string
  onChange: (val: string) => void
  length?: number
  autoFocus?: boolean
  disabled?: boolean
}

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
  disabled,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const handleChange = (idx: number, char: string) => {
    const cleaned = char.replace(/\D/g, "").slice(0, 1)
    const arr = value.split("")
    arr[idx] = cleaned
    const newVal = arr.join("").slice(0, length)
    onChange(newVal)
    if (cleaned && idx < length - 1) refs.current[idx + 1]?.focus()
  }

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      refs.current[idx - 1]?.focus()
    }
    if (e.key === "ArrowLeft" && idx > 0) refs.current[idx - 1]?.focus()
    if (e.key === "ArrowRight" && idx < length - 1) refs.current[idx + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length)
    onChange(pasted)
    refs.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center" onPaste={handlePaste}>
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => {refs.current[idx] = el}}
          type="text"
          inputMode="numeric"
          maxLength={1}
          disabled={disabled}
          value={value[idx] ?? ""}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          className="w-12 h-14 text-center text-2xl font-serif border border-stone-200 rounded-xl bg-white text-ink focus:outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all disabled:opacity-50 tabular"
        />
      ))}
    </div>
  )
}