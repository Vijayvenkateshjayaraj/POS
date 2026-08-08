FROM node:22-alpine AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM dependencies AS build
WORKDIR /workspace
COPY apps/web apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @unified-commerce/web

FROM node:22-alpine AS runtime
WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /workspace/package.json /workspace/package-lock.json ./
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/web/package.json apps/web/package.json
COPY --from=build /workspace/apps/web/.next apps/web/.next
COPY --from=build /workspace/apps/web/public apps/web/public
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@unified-commerce/web"]
