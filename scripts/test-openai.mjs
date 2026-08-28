import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  console.error("");
  console.error(
    "❌ OPENAI_API_KEY não foi encontrada."
  );

  console.error(
    "Confira se o arquivo .env.local está na raiz do projeto."
  );

  console.error("");

  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

console.log("");
console.log(
  "🤖 Testando conexão com a OpenAI..."
);
console.log("");

try {
  const response =
    await openai.responses.create({
      model: "gpt-5.6",

      input:
        "Responda apenas com esta frase: Conexão com a OpenAI funcionando.",
    });

  console.log(
    "✅ Conexão funcionando!"
  );

  console.log("");
  console.log("Resposta:");
  console.log(response.output_text);
  console.log("");
} catch (error) {
  console.error("");
  console.error(
    "❌ Erro ao conectar com a OpenAI."
  );
  console.error("");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  console.error("");

  process.exit(1);
}