import { useEffect } from "react";
import { useLanguage } from "../../context/LanguageContext.js";

interface Props {
  title: string;
  description?: string;
}

/** Minimal document-title setter (stands in for react-helmet). */
export default function PageMeta({ title, description }: Props) {
  const { t, language } = useLanguage();

  useEffect(() => {
    document.title = t(title);
    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", t(description));
    }
  }, [title, description, language, t]);

  return null;
}
