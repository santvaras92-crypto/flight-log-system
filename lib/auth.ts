import NextAuth, { AuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcrypt";

export const authOptions: AuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { 
    strategy: "jwt",
    maxAge: 90 * 24 * 60 * 60, // 90 días
  },
  providers: [
    Credentials({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.password) return null;
        if (user.rol === 'INACTIVO') return null; // deactivated account — standard rejection
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) return null;
        return { id: String(user.id), email: user.email, name: user.nombre, role: user.rol, codigo: user.codigo } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role || (user as any).rol;
        token.userId = (user as any).id;
        token.codigo = (user as any).codigo;
      } else if (token.userId) {
        // Revalidate against DB (throttled to once per 10 min per token) so that
        // deactivated users lose live JWT sessions without waiting out maxAge.
        const now = Math.floor(Date.now() / 1000);
        const lastCheck = (token.lastDbCheck as number) || 0;
        if (now - lastCheck > 600) {
          const dbUser = await prisma.user.findUnique({
            where: { id: Number(token.userId) },
            select: { rol: true },
          });
          if (!dbUser || dbUser.rol === 'INACTIVO') {
            return null as any; // invalidates the session
          }
          token.role = dbUser.rol;
          token.lastDbCheck = now;
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).role = token.role;
      (session as any).userId = token.userId;
      (session as any).codigo = token.codigo;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};

export const getAuthOptions = () => authOptions;
