import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, type Lang } from "@/i18n/translations";
import { setLanguage } from "@/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline text-xs font-medium uppercase">
            {current.code}
          </span>
          <span className="sm:hidden">{current.flag}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => setLanguage(l.code as Lang)}>
            <span className="mr-2">{l.flag}</span>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}