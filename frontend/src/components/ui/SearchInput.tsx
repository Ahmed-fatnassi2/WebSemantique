import { Search, X } from "lucide-react";

export function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && (
        <button className="icon-btn" onClick={() => onChange("")} aria-label="Effacer la recherche">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
