# ConnectAI

Plataforma Full Stack de comunicação em tempo real com recursos de Inteligência Artificial.

> 🚧 Projeto em desenvolvimento.

O **ConnectAI** está sendo desenvolvido como um projeto de estudo e portfólio, com foco em tecnologias utilizadas no mercado de desenvolvimento Full Stack.

A proposta é construir uma plataforma onde usuários possam criar contas, participar de salas, trocar mensagens em tempo real, realizar chamadas de vídeo e utilizar recursos de Inteligência Artificial.

---

## 🎯 Objetivo do projeto

O projeto tem como objetivo praticar a construção de uma aplicação moderna desde o início, passando por frontend, backend, banco de dados, comunicação em tempo real, infraestrutura e deploy.

A aplicação será evoluída gradualmente, adicionando novas funcionalidades conforme cada tecnologia é estudada.

---

## ✅ Funcionalidades atuais

Atualmente o projeto possui:

- Página de login;
- Página de cadastro;
- Navegação entre as páginas;
- Componentes React reutilizáveis;
- Controle de formulários com estado;
- Validação de campos;
- Validação de formato de e-mail;
- Validação de confirmação de senha;
- Mensagens de erro específicas para cada campo;
- Interface responsiva utilizando Tailwind CSS.

---

## 🛠️ Tecnologias utilizadas atualmente

- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint
- Git
- GitHub

---

## 🗺️ Roadmap

O projeto será expandido com as seguintes tecnologias e funcionalidades:

### Frontend

- Dashboard do usuário;
- Perfil;
- Salas de reunião;
- Chat;
- Interface de videochamada;
- Histórico de reuniões.

### Backend

- Node.js;
- NestJS;
- APIs REST;
- Autenticação;
- Controle de usuários e permissões.

### Banco de dados

- PostgreSQL;
- Modelagem de usuários;
- Reuniões;
- Mensagens;
- Histórico.

### Tempo real

- WebSockets;
- Presença de usuários;
- Chat em tempo real;
- Redis;
- WebRTC;
- Áudio e vídeo em tempo real.

### Inteligência Artificial

- Integração com LLMs;
- Resumo de reuniões;
- Identificação de tópicos;
- Geração de tarefas e próximos passos.

### Infraestrutura

- Docker;
- Testes;
- Segurança;
- Logs;
- Deploy em nuvem.

---

## 📁 Estrutura atual

```text
src/
├── app/
│   ├── cadastro/
│   │   └── page.tsx
│   └── page.tsx
│
└── components/
    ├── FormField.tsx
    ├── LoginForm.tsx
    └── RegisterForm.tsx