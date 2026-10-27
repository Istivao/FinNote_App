import { supabase } from "@/integrations/supabase/client";

const BUCKET = "zone-images";
const MAX_SIDE = 2000;
const JPEG_QUALITY = 0.85;

async function zoneImagePath() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Faça login novamente para acessar suas zonas.");
  return `${userId}/zones`;
}

/** Baixa a imagem das zonas do usuário; devolve null se ele ainda não carregou nenhuma. */
export async function getZoneImage(): Promise<Blob | null> {
  const path = await zoneImagePath();
  const folder = path.split("/")[0]!;
  const { data: files, error: listError } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: "zones" });
  if (listError) throw new Error(listError.message);
  if (!files?.some((file) => file.name === "zones")) return null;

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(error.message);
  return data;
}

// Formatos aceitos pelo bucket; os demais (ex.: HEIC) são convertidos para JPEG.
const STORED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Reduz fotos grandes para no máximo 2000 px no maior lado, em JPEG. */
async function shrinkImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Formato de imagem não suportado. Use JPG ou PNG.");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_500_000 && STORED_TYPES.includes(file.type)) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível processar a imagem."))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

export async function uploadZoneImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");

  const image = await shrinkImage(file);
  const { error } = await supabase.storage.from(BUCKET).upload(await zoneImagePath(), image, {
    upsert: true,
    contentType: image.type || "image/jpeg",
    cacheControl: "0",
  });
  if (error) throw new Error(error.message);
}

export async function deleteZoneImage() {
  const { error } = await supabase.storage.from(BUCKET).remove([await zoneImagePath()]);
  if (error) throw new Error(error.message);
}
