import { useEffect } from "react";

interface Props {
  title: string;
  description?: string;
}

/** Minimal document-title setter (stands in for react-helmet). */
export default function PageMeta({ title, description }: Props) {
  useEffect(() => {
    document.title = title;
    if (description) {
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", description);
    }
  }, [title, description]);

  return null;
}
