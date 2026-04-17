import { Session, Message } from './types';

const now = Date.now();
const min = 60000;

export const mockSessions: Session[] = [
  {
    id: 's1',
    title: 'Setup Expo — Eon Chat iOS',
    snippet: 'Setup do Expo finalizado com sucesso!',
    created: now - 45 * min,
    updated: now - 2 * min,
    messageCount: 7,
  },
  {
    id: 's2',
    title: 'VM Guardian — fix CPU alert',
    snippet: 'O guardian tá reiniciando o builder-dev quando…',
    created: now - 3 * 60 * min,
    updated: now - 60 * min,
    messageCount: 12,
  },
  {
    id: 's3',
    title: 'Eon Cloud — billing model',
    snippet: 'Platform keys + usage billing implementado',
    created: now - 8 * 60 * min,
    updated: now - 4 * 60 * min,
    messageCount: 23,
  },
  {
    id: 's4',
    title: 'Clawdio — Google Calendar OAuth',
    snippet: 'OAuth flow completo, tokens refreshing OK',
    created: now - 24 * 60 * min,
    updated: now - 12 * 60 * min,
    messageCount: 18,
  },
  {
    id: 's5',
    title: 'Jarvis — memória episódica',
    snippet: 'Sistema de memória contínua com embeddings…',
    created: now - 48 * 60 * min,
    updated: now - 24 * 60 * min,
    messageCount: 31,
  },
];

export const mockMessages: Record<string, Message[]> = {
  s1: [
    {
      id: 1,
      role: 'user',
      text: 'Fala Claude, quero criar um app iOS pro Eon Chat usando Expo. Dá pra fazer?',
      ts: now - 45 * min,
    },
    {
      id: 2,
      role: 'assistant',
      text: 'Claro! O Expo permite criar apps iOS e Android com o mesmo código TypeScript. Vou configurar o projeto com:\n\n- **Expo SDK 54** + React Native 0.81\n- **TypeScript** template\n- **react-native-web** pra preview no browser\n- **EAS Build** pra compilar o .ipa sem precisar de Mac\n\nVou começar criando o projeto.',
      ts: now - 44 * min,
      durationMs: 3200,
      costUsd: 0.0041,
    },
    {
      id: 3,
      role: 'user',
      text: 'Manda bala, quero ver funcionando',
      ts: now - 30 * min,
    },
    {
      id: 4,
      role: 'assistant',
      text: 'Projeto criado em `/root/eon-chat/`. Instalei todas as dependências:\n\n```\nnpx create-expo-app eon-chat --template blank-typescript\nnpx expo install react-native-web react-dom\n```\n\nServidor rodando em `localhost:8099`. Vou criar as telas agora.',
      ts: now - 29 * min,
      durationMs: 8400,
      costUsd: 0.0127,
    },
    {
      id: 5,
      role: 'user',
      text: 'Faz o app idêntico ao chat-mobile que já temos',
      ts: now - 10 * min,
    },
    {
      id: 6,
      role: 'assistant',
      text: 'Entendi — vou replicar pixel-perfect o chat-mobile:\n\n- Dark theme Eon (#0a0a0f, #c5ff3d)\n- Login screen com logo e form\n- Sidebar com sessões\n- Chat com bubbles, typing indicator, activity log\n- Composer com attach, voice, send\n\nCriando todos os componentes agora.',
      ts: now - 9 * min,
      durationMs: 4100,
      costUsd: 0.0058,
    },
    {
      id: 7,
      role: 'assistant',
      text: 'Setup do Expo finalizado com sucesso! O app tá rodando e acessível pelo tunnel.',
      ts: now - 2 * min,
      durationMs: 12300,
      costUsd: 0.0234,
    },
  ],
  s2: [
    {
      id: 10,
      role: 'user',
      text: 'O guardian tá alertando CPU alta no builder-dev. Dá uma olhada?',
      ts: now - 3 * 60 * min,
    },
    {
      id: 11,
      role: 'assistant',
      text: 'Vou verificar. O builder-dev-web tá consumindo 87% de CPU — parece um hot reload loop. Reiniciei o processo via PM2 e o uso caiu pra 12%.',
      ts: now - 3 * 60 * min + 5 * min,
      durationMs: 6700,
      costUsd: 0.0089,
    },
  ],
};
