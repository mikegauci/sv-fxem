import { htmlResponse, pagePaths, renderPage } from "@/lib/site/render";

// Every public page of the site: prerendered at build, cached afterwards.
// Unknown paths get the branded bilingual 404 page.
export async function generateStaticParams() {
  return (await pagePaths()).map((slug) => ({
    path: slug ? slug.split("/") : [],
  }));
}

export async function GET(
  _request: Request,
  { params }: RouteContext<"/[[...path]]">,
) {
  const { path = [] } = await params;
  const slug = path.map((part) => decodeURIComponent(part)).join("/");
  return htmlResponse(await renderPage(slug));
}
