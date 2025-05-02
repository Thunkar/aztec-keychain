#include "captive_portal.h"

DNSServer dnsServer;
AsyncWebServer server(80);
AsyncWebSocket ws("/");

static AsyncCallbackJsonWebHandler *settingsHandler = new AsyncCallbackJsonWebHandler("/settings");
void configureSettingsHandler() {
  settingsHandler->setMethod(HTTP_POST | HTTP_GET);
  settingsHandler->onRequest([](AsyncWebServerRequest *request, JsonVariant &json) {
    if(request->method() == HTTP_POST) {
      const char* SSID = json.as<JsonObject>()["SSID"];
      const char* password = json.as<JsonObject>()["password"];
      writeSSID(SSID);
      writePassword(password);
      request->send(200, "text/plain", "Ok");
    } else {
      AsyncJsonResponse *response = new AsyncJsonResponse();
      JsonObject root = response->getRoot().to<JsonObject>();
      char SSID[32];
      char password[32];
      readSSID(SSID);
      readPassword(password);
      root["SSID"] = SSID;
      root["password"] = password;
      response->setLength();
      request->send(response);
    }
  });
}

static AsyncCallbackJsonWebHandler *accountsHandler = new AsyncCallbackJsonWebHandler("/accounts");
void configureaccountsHandler() {
  accountsHandler->setMethod(HTTP_POST | HTTP_GET);
  accountsHandler->onRequest([](AsyncWebServerRequest *request, JsonVariant &json) {
    KeyPair keyPair;
    uint8_t msk[32];
    uint8_t salt[32];
    if(request->method() == HTTP_POST) {
      state.status = GENERATING_ACCOUNT;
      int index = json.as<JsonObject>()["index"];
      generateKeyPair(&keyPair);
      writeKeyPair(index, &keyPair);
      RNG(msk, 32);
      RNG(salt, 32);
      writeSecretKey(index, msk);
      writeSalt(index, salt);
      state.status = IDLE;
      request->send(200, "text/plain", "Ok");
    } else {
      AsyncJsonResponse *response = new AsyncJsonResponse();
      JsonObject root = response->getRoot().to<JsonObject>();
      JsonArray pk_array = root[F("pk")].to<JsonArray>();
      JsonArray msk_array = root[F("msk")].to<JsonArray>();
      JsonArray salt_array = root[F("salt")].to<JsonArray>();

      int index = request->getParam("index")->value().toInt();
      root["index"] = index;

      readKeyPair(index, &keyPair);
      for(int i = 0; i < 64; i++) {
        pk_array[i] = keyPair.pk[i];
      }
      readSecretKey(index, msk);
      for(int i = 0; i < 32; i++) {
        msk_array[i] = msk[i];
      }
      readSalt(index, salt);
      for(int i = 0; i < 32; i++) {
        salt_array[i] = salt[i];
      }
      response->setLength();
      request->send(response);
    }
  });
}

static AsyncCallbackJsonWebHandler *signatureHandler = new AsyncCallbackJsonWebHandler("/signature");
void configureSignatureHandler() {
  signatureHandler->setMethod(HTTP_POST | HTTP_GET);
  signatureHandler->onRequest([](AsyncWebServerRequest *request, JsonVariant &json) {
    KeyPair keyPair;
    JsonDocument response;

    if(request->method() == HTTP_POST) {
      bool approve = json.as<JsonObject>()["approve"];
      if(approve) {
        KeyPair keyPair;
        readKeyPair(state.currentSignatureRequest.index, &keyPair);
        uint8_t signature[64];
        sign(&keyPair, state.currentSignatureRequest.msg, signature);
        response[F("type")] = SIGNATURE_ACCEPTED_RESPONSE;
        JsonArray jsonSignature = response[F("data")][F("signature")].to<JsonArray>();
        for(int i = 0; i < 64; i++) {
          jsonSignature[i] = signature[i];
        }
      } else {
        response[F("type")] = SIGNATURE_REJECTED_RESPONSE;
      }
      char output[512];
      serializeJson(response, output);
      Serial.println(output);
      state.status = IDLE;
      request->send(200, "text/plain", "Ok");
    } else {
      AsyncJsonResponse *response = new AsyncJsonResponse();
      JsonObject root = response->getRoot().to<JsonObject>();
      readKeyPair(state.currentSignatureRequest.index, &keyPair);
      JsonArray pk = root["pk"].to<JsonArray>();
      JsonArray msg = root["msg"].to<JsonArray>();
      for(int i = 0; i < 64; i++) {
        pk[i] = keyPair.pk[i];
      }
      for(int i = 0; i < 64; i++) {
        msg[i] = state.currentSignatureRequest.msg[i];
      }
      root["index"] = state.currentSignatureRequest.index;
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

  configureaccountsHandler();
  configureSignatureHandler();
  configureSettingsHandler();

  ws.onEvent(onEvent);
  server.addHandler(&ws);
  server.addHandler(new CaptivePortalHandler()).setFilter(ON_AP_FILTER);
  server.addHandler(accountsHandler);
  server.addHandler(signatureHandler);
  server.addHandler(settingsHandler);
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