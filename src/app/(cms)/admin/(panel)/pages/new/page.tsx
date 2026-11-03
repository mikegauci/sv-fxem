import { AdminPageHeader } from "@/components/admin/page-header";
import { PageEditor } from "@/components/admin/page-editor";

export const metadata = { title: "New page" };

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export default async function NewPage({
  searchParams,
}: PageProps<"/admin/pages/new">) {
  const { lang } = await searchParams;
  const language = lang === "ar" ? "ar" : "en";
  return (
    <>
      <AdminPageHeader
        title={language === "ar" ? "New Arabic page" : "New page"}
        description="New pages use the site's standard page layout. Add text sections and save as a draft to preview."
      />
      <PageEditor
        initial={{
          id: null,
          language,
          translationId: null,
          path: language === "ar" ? "ar/" : "",
          title: "",
          status: "draft",
          seo: {},
          sections: [
            { id: null, kind: "rich_text", label: "Text", html: "<p></p>" },
          ],
        }}
        translation={null}
        publicPath={null}
      />
    </>
  );
}
