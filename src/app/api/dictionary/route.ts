import { DictionaryError, lookupDictionary } from "@/lib/dictionary";
export async function GET(request: Request) {
  try {
    const word = new URL(request.url).searchParams.get("word");
    const result = await lookupDictionary(word || "");
    return Response.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const known =
      error instanceof DictionaryError
        ? error
        : new DictionaryError(
            502,
            "unavailable",
            "The dictionary is unavailable right now. Try again later.",
          );
    return Response.json(
      { error: known.code, message: known.message },
      { status: known.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
