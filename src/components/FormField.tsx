import type { ChangeEventHandler } from "react";

// Define todas as informações que um campo pode receber.
type FormFieldProps = {
  id: string;
  label: string;
  type: "text" | "email" | "password";
  placeholder: string;
  value: string;
  error?: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
};

export default function FormField({
  id,
  label,
  type,
  placeholder,
  value,
  error,
  onChange,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-zinc-300"
      >
        {label}
      </label>

      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`w-full rounded-lg border bg-zinc-800 px-4 py-3 text-white outline-none transition ${
          error
            ? "border-red-500 focus:border-red-400"
            : "border-zinc-700 focus:border-violet-500"
        }`}
      />

      {/* O erro só aparece quando existir uma mensagem. */}
      {error && (
        <p className="mt-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}