import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type ApplicantOption = { id: string; name: string; label: string }

/** قائمة واحدة: الكتابة فيها تصفّي المتقدمين المطابقين. */
export function ApplicantCombobox({
  options,
  value,
  onChange,
  className,
  placeholder = 'اكتب اسم المتقدم',
}: {
  options: ApplicantOption[]
  value: string
  onChange: (name: string) => void
  className?: string
  placeholder?: string
}) {
  const listId = useId()
  const boxRef = useRef<HTMLDivElement>(null)
  const typing = useRef(false)
  const previous = useRef(value)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (typing.current) {
      typing.current = false
      previous.current = value
      return
    }
    if (previous.current && !value) setText('')
    else if (value) {
      const selected = options.find((option) => option.name === value)
      if (selected) setText(selected.label)
    }
    previous.current = value
  }, [value, options])

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const matches = useMemo(() => {
    const selected = options.find((option) => option.name === value)
    const q = text.trim().toLowerCase()
    if (!q || (selected && text === selected.label)) return options
    return options.filter((option) => option.label.toLowerCase().includes(q) || option.name.toLowerCase().includes(q))
  }, [options, text, value])

  function choose(option: ApplicantOption) {
    typing.current = false
    setText(option.label)
    onChange(option.name)
    setOpen(false)
  }

  function type(next: string) {
    typing.current = true
    setText(next)
    setOpen(true)
    setActive(0)
    const exact = options.find((option) => option.label === next || option.name === next)
    onChange(exact ? exact.name : '')
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="المتقدم"
        className={className}
        placeholder={placeholder}
        value={text}
        onChange={(event) => type(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
            setActive((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            setActive((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && open && matches[active]) {
            event.preventDefault()
            choose(matches[active])
          } else if (event.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-line bg-panel py-1 text-right shadow-lg">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-mute">لا توجد نتيجة مطابقة</li>
          ) : (
            matches.map((option, index) => (
              <li key={option.id} role="option" aria-selected={option.name === value}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-right text-sm ${index === active || option.name === value ? 'bg-gold/15 text-light-gold' : 'text-text hover:bg-gold/10'}`}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                >
                  {option.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
