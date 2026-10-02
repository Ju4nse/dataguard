import { useCallback, useEffect, useState } from 'react';
import { api, type Me } from './api';
import { Dashboard } from './components/Dashboard';
import { Enroll2FA, Login } from './components/Login';
import { Button, Card, Logo } from './components/ui';

type View = { kind: 'cargando' } | { kind: 'login' } | { kind: 'configurar2fa' } | { kind: 'sinAcceso'; me: Me } | { kind: 'panel'; me: Me };

export default function App() {
  const [view, setView] = useState<View>({ kind: 'cargando' });

  const refresh = useCallback(async () => {
    try {
      const me = await api<Me>('/me');
      if (me.mfa === 'configurar') setView({ kind: 'configurar2fa' });
      else if (me.usuario.rol === 'empleado') setView({ kind: 'sinAcceso', me });
      else setView({ kind: 'panel', me });
    } catch {
      // Sin sesión, sesión vencida o servidor caído: se vuelve al login (que muestra el error al intentar).
      setView({ kind: 'login' });
    }
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', {}).catch(() => {});
    setView({ kind: 'login' });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  switch (view.kind) {
    case 'cargando':
      return null;
    case 'login':
      return <Login onDone={refresh} />;
    case 'configurar2fa':
      return <Enroll2FA onDone={refresh} onLogout={logout} />;
    case 'sinAcceso':
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <Card className="max-w-sm space-y-4 p-6 text-center">
            <div className="flex justify-center">
              <Logo />
            </div>
            <p className="text-sm text-slate-600">Hola {view.me.usuario.nombre}. Este panel es solo para responsables de seguridad.</p>
            <Button variant="ghost" onClick={logout}>
              Cerrar sesión
            </Button>
          </Card>
        </div>
      );
    case 'panel':
      return <Dashboard me={view.me} onLogout={logout} />;
  }
}
