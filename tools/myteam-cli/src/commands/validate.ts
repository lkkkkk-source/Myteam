/** myteam validate — 发布前一致性检查（validation report，只报告）。 */
import { WORKSPACE } from "../services/registry-service";
import { validate as runValidate } from "../services/validation-service";
import { header } from "../output/formatter";

const MARK: Record<string, string> = { ok: "✓", warning: "!", error: "✗" };

export function validate(workspace = WORKSPACE): { text: string; ok: boolean } {
  const { findings, ok } = runValidate(workspace);
  const lines = findings.map((f) => `  ${MARK[f.level]} [${f.area}] ${f.message}`);
  const text = [
    header("myteam validate"),
    ...lines,
    "",
    ok ? "validation: PASS (release allowed)" : "validation: FAIL (release blocked)",
  ].join("\n");
  return { text, ok };
}
