import { Body, Controller, Post } from "@nestjs/common";
import { AiService } from "./ai.service";
import { AnswerQuestionDto } from "./dto/answer-question.dto";

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("answer")
  answer(@Body() dto: AnswerQuestionDto) {
    return this.aiService.answer(dto);
  }
}
