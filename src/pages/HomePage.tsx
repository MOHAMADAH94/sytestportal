import { ArrowLeft, KeyRound, ShieldCheck, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CATEGORY_META, EXAM_LEVELS, type ExamCategory } from '../data/types'

export function HomePage() {
  const categories = Object.keys(CATEGORY_META) as ExamCategory[]

  return (
    <div className="space-y-10 animate-fade-up">
      <section className="relative overflow-hidden rounded-[1.75rem] border border-line bg-gradient-to-br from-panel via-ink to-void px-6 py-12 sm:px-12">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-l from-transparent via-gold/70 to-transparent" />
        <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[auto_1fr]">
          <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full border border-line bg-void/50 p-4 shadow-[0_0_40px_rgba(193,165,118,0.18)] sm:h-48 sm:w-48">
            <img
              src="/logo.png"
              alt="شعار منصة الاختبارات"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="text-center lg:text-right">
            <p className="mb-3 text-xs font-bold tracking-[0.2em] text-accent-gold uppercase">
              منظومة تقييم واختبارات
            </p>
            <h1 className="mb-4 text-3xl font-extrabold leading-tight text-light-gold sm:text-5xl">
              منصة الاختبارات
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-8 text-text-2/90 lg:mx-0">
              إدارة احترافية لاختبارات العام والشفهية وأهلية قيادة الضابط (القيادة والأهلية القيادية) وتقييم الشخصية،
              بحسابات وصول مستقلة لكل اختصاص. علامة الاختيار من متعدد تظهر للمتقدم واللجنة، والأسئلة الكتابية تُراجع يدوياً.
            </p>
            <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3.5 text-sm font-extrabold text-ink shadow-lg shadow-gold/15 transition hover:bg-accent-gold"
              >
                حسابات الوصول
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-gold/10 blur-3xl" />
      </section>

      <section className="grid gap-4 md:grid-cols-3 animate-fade-up-delay">
        <div className="surface-card rounded-2xl p-5">
          <KeyRound className="mb-3 h-7 w-7 text-gold" />
          <h2 className="text-lg font-bold text-light-gold">حسابات الوصول</h2>
          <p className="mt-2 text-sm leading-7 text-mute">
            حساب مستقل لكل نوع اختبار، بما فيها فئات الشفهي الخمس وأهلية قيادة الضابط.
          </p>
        </div>
        <div className="surface-card rounded-2xl p-5">
          <UserRound className="mb-3 h-7 w-7 text-gold" />
          <h2 className="text-lg font-bold text-light-gold">جلسة الممتحن</h2>
          <p className="mt-2 text-sm leading-7 text-mute">
            الدخول للاختبار الكتابي والعام يتم عبر رمز QR، وتظهر علامة الاختيار من متعدد بعد التسليم. الأسئلة الكتابية تُراجع يدوياً.
          </p>
        </div>
        <div className="surface-card rounded-2xl p-5">
          <ShieldCheck className="mb-3 h-7 w-7 text-gold" />
          <h2 className="text-lg font-bold text-light-gold">سجل النتائج</h2>
          <p className="mt-2 text-sm leading-7 text-mute">
            النتائج تُخزَّن في قاعدة البيانات وتُعرض لحساب الوصول أو المسؤول فقط.
          </p>
        </div>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-light-gold">أنواع الاختبارات</h2>
            <div className="gold-rule mt-3 w-28" />
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAM_LEVELS.map((l) => (
              <span
                key={l.id}
                className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold text-gold"
              >
                {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {categories.map((key) => (
            <div key={key} className="surface-card rounded-2xl p-5 transition hover:border-gold">
              <div className="font-bold text-text">{CATEGORY_META[key].label}</div>
              <p className="mt-2 text-sm leading-7 text-mute">{CATEGORY_META[key].description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
