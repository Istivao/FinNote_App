# FinNote

Aplicação mobile-first para organizar treinos de academia por dia da semana.

## Stack

- React e Vite
- TanStack Router e TanStack Query
- Supabase Auth e PostgreSQL
- Tailwind CSS

## Configuração

1. Crie um arquivo `.env` a partir de `.env.example`.
2. Defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Execute os arquivos de `supabase/migrations` em ordem no SQL Editor do Supabase.
4. Em Authentication > URL Configuration, adicione `http://localhost:8080/**` aos redirects permitidos.

A aplicação usa somente a chave publishable no navegador. Não adicione uma chave `service_role` a variáveis `VITE_*`.

## Desenvolvimento

```sh
npm install
npm run dev
```

A aplicação fica disponível em `http://localhost:8080`.

## Verificação

```sh
npm run typecheck
npm run lint
npm run build
```

Ao publicar o SPA, configure o host para redirecionar todas as rotas para `index.html`.

## Android

O projeto nativo usa Capacitor 8 e está em `android/`. Ele requer Node.js 22 ou superior,
Android Studio Otter 2025.2.1 ou superior, JDK 21 e Android SDK 36.

Antes de abrir o Android Studio, gere a aplicação web e sincronize os arquivos nativos:

```sh
npm install
npm run android:sync
npm run android:open
```

Repita `npm run android:sync` sempre que alterar o código web, as variáveis de `.env` ou a
configuração do Capacitor. Também é possível abrir manualmente a pasta `android/` no Android
Studio.

### APK de teste

No Android Studio, aguarde o Gradle Sync e use **Build > Build App Bundle(s) or APK(s) > Build
APK(s)**. O arquivo será criado em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

No Windows, o mesmo APK pode ser gerado sem abrir o Android Studio:

```powershell
npm run android:sync
.\android\gradlew.bat -p android assembleDebug
```

### APK assinado

Para distribuição, use **Build > Generate Signed App Bundle or APK**, selecione **APK**, crie ou
selecione um keystore e escolha a variante `release`. Guarde o keystore e suas senhas: futuras
atualizações precisam ser assinadas pela mesma chave. Arquivos `*.jks` e `*.keystore` estão
ignorados pelo projeto para evitar que a chave privada seja versionada.

Antes de publicar uma nova versão, incremente `versionCode` e ajuste `versionName` em
`android/app/build.gradle`.
