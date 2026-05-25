# Elvi-Ra · Boceto v0.1

Plataforma interna S-NFI Corp. Boceto inicial: Login + Dashboard + Customer Management.

## Estructura

```
app/
  backend/        Node.js + Express (auth + customers JSON store)
  frontend/
    css/theme.css     Estética Brizna + Apple + Palantir
    js/api.js         Cliente fetch + sesión
    pages/
      login.html
      dashboard.html
      customer-management.html
```

## Arranque

```bash
cd app/backend
npm install
npm start
```

Abre http://localhost:5173 → redirige a `/pages/login.html`.

## Credenciales (de `Creedenciales.txt`)

| Usuario      | Contraseña  |
|--------------|-------------|
| Marc Blanes  | Marc2005    |
| Nour         | Nour 2026   |

## Notas

- Sesión vía token en memoria (8h). Para producción: JWT + DB.
- `customers.json` es por usuario; cada cuenta opera su propia hoja.
- Otras mesas (Buscador de Empresas, Data Inteligente, LinkedIn, Email Creator) quedan marcadas como "próximamente" en el Dashboard.
