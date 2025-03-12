type CliOutput = {
  original_headline: string;
  transformed_headline: string;
  provider_used: string;
}

export type HeadlineData = {
  originalHeadline: string;
  transformedHeadline: string;
  providerUsed: string;
}

type TransformHeadlineArgs = {
  title: string;
  author: string;
  content: string;
}

export default async function transformHeadline({
  title,
  author,
  content,
}: TransformHeadlineArgs): Promise<HeadlineData> {
  const command = new Deno.Command("transform-headline", {
    args: [
      "--headline", title,
      "--author", author,
      "--body", content,
      "--output-format", "json",
      "--provider", "openai"
    ]
  });

  const { stdout, stderr, success } = await command.output();

  if (!success) {
    const errorMessage = new TextDecoder().decode(stderr);
    throw new Error(`Headline transformation failed: ${errorMessage}`);
  }

  const data = JSON.parse(new TextDecoder().decode(stdout)) as CliOutput;
  return {
    originalHeadline: data.original_headline,
    transformedHeadline: data.transformed_headline,
    providerUsed: data.provider_used,
  };
}