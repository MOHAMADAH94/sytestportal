import { ArrowUpDown, Filter, RotateCcw, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'

type Option = { id: string; label: string }

type SelectFilter = {
  id: string
  label: string
  value: string
  options: Option[]
  onChange: (v: string) => void
}

type Props = {
  search: string
  onSearchChange: (v: string) => void
  searchPlaceholder?: string
  filters?: SelectFilter[]
  sortValue: string
  sortOptions: Option[]
  onSortChange: (v: string) => void
  shown: number
  total: number
  onReset?: () => void
  extraFilters?: ReactNode
}

const field =
  'w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-text outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20'

export function AdminListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'ابحث...',
  filters = [],
  sortValue,
  sortOptions,
  onSortChange,
  shown,
  total,
  onReset,
  extraFilters,
}: Props) {
  const hasActive =
    !!search.trim() ||
    filters.some((f) => f.value !== 'all' && f.value !== f.options[0]?.id) ||
    sortValue !== sortOptions[0]?.id

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-card to-panel/80 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 bg-panel/60 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-gold/10">
            <Filter className="h-4 w-4 text-gold" />
          </span>
          <div>
            <div className="text-sm font-extrabold text-light-gold">بحث وتصفية</div>
            <div className="text-[11px] text-mute">ابحث أو ضيّق النتائج حسب المعايير</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gold/35 bg-gold/10 px-3 py-1 text-xs font-bold text-light-gold">
            {shown} / {total}
          </span>
          {onReset && hasActive && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-bold text-mute transition hover:border-gold/50 hover:text-gold"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              مسح الكل
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-4">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-text-2">
            <Search className="h-3.5 w-3.5 text-gold" />
            البحث
          </span>
          <div className="relative">
            <input
              type="search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className={`${field} py-3 pl-10 pr-4 text-base sm:text-sm`}
            />
            {search ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-mute hover:bg-panel hover:text-error"
                aria-label="مسح البحث"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
            )}
          </div>
        </label>

        <div
          className={`grid gap-3 ${
            filters.length + 1 + (extraFilters ? 1 : 0) >= 4
              ? 'sm:grid-cols-2 xl:grid-cols-4'
              : filters.length >= 1
                ? 'sm:grid-cols-2 lg:grid-cols-3'
                : 'sm:grid-cols-1'
          }`}
        >
          {filters.map((f) => (
            <label key={f.id} className="block">
              <span className="mb-1.5 block text-xs font-bold text-text-2">{f.label}</span>
              <select value={f.value} onChange={(e) => f.onChange(e.target.value)} className={field}>
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-text-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-gold" />
              الترتيب
            </span>
            <select value={sortValue} onChange={(e) => onSortChange(e.target.value)} className={field}>
              {sortOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {extraFilters}
        </div>
      </div>
    </div>
  )
}

export function AdminFilterField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Option[]
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-text-2">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-line bg-panel px-3 py-2.5 text-sm text-text outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
