import { cn } from "@/lib/cn";

// Общий стиль для input/select/textarea — один класс на все три, чтобы
// фокус-кольцо, бордер и transition были гарантированно одинаковыми.
const FIELD_CLASS =
  "w-full rounded-app-sm border border-line bg-surface px-3 py-2.5 font-body text-base text-ink transition duration-150 ease-out hover:border-primary-soft focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-primary-light";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_CLASS, className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD_CLASS, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_CLASS, "min-h-[120px] resize-y", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("flex flex-col gap-1.5 text-[0.9rem] font-semibold", className)} {...props} />;
}

export function FormRoot({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return <form className={cn("flex max-w-[480px] flex-col gap-3.5", className)} {...props} />;
}

// Строка фильтров над списком (события, школы) — в отличие от FormRoot,
// раскладывается в ряд и не ограничена по ширине.
export function FiltersForm({ className, ...props }: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      className={cn(
        "mb-6 flex flex-row flex-wrap items-end gap-3 rounded-app border border-line bg-surface p-4 shadow-sm [&>label]:min-w-[140px] [&>label]:flex-1",
        className
      )}
      {...props}
    />
  );
}
