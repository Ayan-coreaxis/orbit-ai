import { runSiteCraftBuild } from "@/lib/site-craft-build";
const id = process.argv[2];
const msg = process.argv.slice(3).join(" ");
const t = Date.now();
runSiteCraftBuild(id, msg).then((r) => {
  console.log("SECONDS", Math.round((Date.now() - t) / 1000));
  console.log("REPLY", r.reply, r.error ?? "");
  console.log("PAGES", r.doc.pages.map((p) => `${p.slug}:${p.sections.length}`).join(" "));
  console.log("CSS", (r.doc.css ?? "").length);
  process.exit(0);
});
