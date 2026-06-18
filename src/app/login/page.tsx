import { LoginForm } from "@/components/login-form";
import { Panel } from "@/components/ui";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-4">
      <Panel className="w-full max-w-md">
        <div className="mb-6">
          <div className="text-2xl font-semibold text-ink">Fesselspiel</div>
          <p className="mt-1 text-sm leading-6 text-graphite">Private Plattform fuer Planung, Dokumentation und Kommunikation.</p>
        </div>
        <div className="mb-5 rounded-md bg-paper p-3 text-sm leading-6 text-graphite">
          Melde dich mit deinem Benutzerkonto an. Ueber das Auge im Passwortfeld kannst du deine Eingabe kurz sichtbar machen, bevor du den Login abschickst.
        </div>
        <LoginForm />
      </Panel>
    </main>
  );
}
