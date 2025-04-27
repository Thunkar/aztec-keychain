#include "wifi_setup.h"

DNSServer dnsServer;
AsyncWebServer server(80);
AsyncWebSocket ws("/");

static AsyncCallbackJsonWebHandler *keysHandler = new AsyncCallbackJsonWebHandler("/keys");
void configureKeysHandler() {
  keysHandler->setMethod(HTTP_POST | HTTP_GET);
  keysHandler->onRequest([](AsyncWebServerRequest *request, JsonVariant &json) {
    KeyPair keyPair;
    if(request->method() == HTTP_POST) {
      int index = json.as<JsonObject>()["index"];
      generateKeyPair(&keyPair);
      for(int i = 0; i < 64; i++) {
        auto what = keyPair.pk[i];
        Serial.println(what);
      }
      writeKeyPair(index, &keyPair);
      request->send(200, "text/plain", "Ok");
    } else {
      AsyncJsonResponse *response = new AsyncJsonResponse();
      JsonObject root = response->getRoot().to<JsonObject>();
      int index = request->getParam("index")->value().toInt();
      readKeyPair(index, &keyPair);
      root["pk"].to<JsonArray>();
      for(int i = 0; i < 64; i++) {
        root["pk"][i] = keyPair.pk[i];
      }
      root["index"] = index;
      response->setLength();
      request->send(response);
    }
  });
}


class CaptivePortalHandler : public AsyncWebHandler {
public:
  CaptivePortalHandler() {}
  virtual ~CaptivePortalHandler() {}

  bool canHandle(AsyncWebServerRequest *request){
    return request->url() == "/" && request->method() == HTTP_GET;
  }

  void handleRequest(AsyncWebServerRequest *request) {
    request->send(SPIFFS, "/index.html", String(), false);
  }
};

void onEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type,
             void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
      break;
    case WS_EVT_DISCONNECT:
      Serial.printf("WebSocket client #%u disconnected\n", client->id());
      break;
    case WS_EVT_DATA:
    case WS_EVT_PONG:
    case WS_EVT_ERROR:
      break;
  }
}

void setupServer(){
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.setTTL(300);
  dnsServer.start(53, "*", WiFi.softAPIP());

  configureKeysHandler();

  ws.onEvent(onEvent);
  server.addHandler(&ws);
  server.addHandler(new CaptivePortalHandler()).setFilter(ON_AP_FILTER);
  server.addHandler(keysHandler);
  server.onNotFound([&](AsyncWebServerRequest *request){
    request->send(SPIFFS, "/index.html", String(), false);
  });
  
  server.begin();
}

TaskResult doServerWork(unsigned long now) {
  dnsServer.processNextRequest();
  ws.textAll(
    state.status + String("")
  );
  return { true, 0 };
}