import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const files = [
  {
    template: "observability/grafana/provisioning/datasources/datasources.yml.tmpl",
    output: "_rendered/grafana/datasources/datasources.yml",
  },
  {
    template: "observability/prometheus/prometheus.yml.tmpl",
    output: "_rendered/prometheus/prometheus.yml",
  },
];

function render(template) {
  return template.replace(/\$\{([A-Z0-9_]+)(:-([^}]*))?\}/g, (_match, key, _fallback, fallbackValue) => {
    return process.env[key] ?? fallbackValue ?? "";
  });
}

for (const file of files) {
  const template = await readFile(file.template, "utf8");
  await mkdir(path.dirname(file.output), { recursive: true });
  await writeFile(file.output, render(template));
  console.log(`rendered ${file.output}`);
}
