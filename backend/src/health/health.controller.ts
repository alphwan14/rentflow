import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  check() {
    return {
      status: "ok",
      service: "rentflow-backend",
      time: new Date().toISOString(),
    };
  }
}
