import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';

const chatModelProvider = {
  provide: 'CHAT_MODEL',
  useFactory: (configService: ConfigService) => {
    return new ChatOpenAI({
      model: configService.get('MODEL_NAME'),
      apiKey: configService.get('OPENAI_API_KEY'),
      configuration: {
        baseURL: configService.get('OPENAI_BASE_URL'),
      },
    });
  },
  inject: [ConfigService],
};
@Module({
  controllers: [AiController],
  providers: [AiService, chatModelProvider],
})
export class AiModule {}
