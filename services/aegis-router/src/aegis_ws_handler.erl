%%%-------------------------------------------------------------------
%%% @doc AegisComms WebSocket Handler
%%%
%%% Handles WebSocket connections from clients using Cowboy.
%%% Protocol: JSON frames for control messages, binary for encrypted blobs.
%%%
%%% Frame types:
%%%   {"type": "auth", "deviceId": "...", "token": "..."}
%%%   {"type": "message", "to": "...", "payload": "<base64 encrypted>"}
%%%   {"type": "presence", "status": "online|away|stealth"}
%%%   {"type": "ack", "messageId": "..."}
%%%
%%% All message payloads are E2E encrypted — server NEVER decrypts.
%%% @end
%%%-------------------------------------------------------------------
-module(aegis_ws_handler).

-export([init/2, websocket_init/1, websocket_handle/2, websocket_info/2, terminate/3]).

%% Cowboy WebSocket callback — upgrade HTTP to WebSocket
init(Req, State) ->
    io:format("  [WS] New connection attempt from ~p~n", 
              [cowboy_req:peer(Req)]),
    {cowboy_websocket, Req, #{authenticated => false, device_id => undefined}}.

%% Called after WebSocket upgrade completes
websocket_init(State) ->
    io:format("  [WS] WebSocket connection established~n"),
    {ok, State}.

%% Handle incoming WebSocket text frames (JSON)
websocket_handle({text, Raw}, State) ->
    try
        Msg = jsx:decode(Raw, [return_maps]),
        handle_message(Msg, State)
    catch
        _:Error ->
            io:format("  [WS] Parse error: ~p~n", [Error]),
            Reply = jsx:encode(#{
                <<"type">> => <<"error">>,
                <<"message">> => <<"Invalid JSON">>
            }),
            {reply, {text, Reply}, State}
    end;

%% Handle binary frames (encrypted blobs — pass through directly)
websocket_handle({binary, Data}, State) ->
    io:format("  [WS] Binary frame received (~p bytes)~n", [byte_size(Data)]),
    {ok, State};

websocket_handle(_Frame, State) ->
    {ok, State}.

%% Handle Erlang messages sent to this process (e.g., from message router)
websocket_info({deliver_message, SenderDeviceId, EncryptedPayload, MessageId}, State) ->
    %% Forward encrypted message to this WebSocket client
    Msg = jsx:encode(#{
        <<"type">> => <<"message">>,
        <<"from">> => list_to_binary(SenderDeviceId),
        <<"payload">> => base64:encode(EncryptedPayload),
        <<"messageId">> => list_to_binary(MessageId)
    }),
    {reply, {text, Msg}, State};

websocket_info({presence_update, DeviceId, Status}, State) ->
    Msg = jsx:encode(#{
        <<"type">> => <<"presence">>,
        <<"deviceId">> => list_to_binary(DeviceId),
        <<"status">> => list_to_binary(Status)
    }),
    {reply, {text, Msg}, State};

websocket_info(_Info, State) ->
    {ok, State}.

%% Cleanup on disconnect
terminate(_Reason, _Req, #{device_id := DeviceId}) when DeviceId =/= undefined ->
    io:format("  [WS] Device ~p disconnected~n", [DeviceId]),
    gen_server:call(aegis_connection_mgr, {unregister, DeviceId}),
    gen_server:call(aegis_presence, {set_status, DeviceId, offline}),
    ok;
terminate(_Reason, _Req, _State) ->
    ok.

%%====================================================================
%% Internal — Message Handling
%%====================================================================

%% Authentication
handle_message(#{<<"type">> := <<"auth">>, <<"deviceId">> := DeviceId} = _Msg, State) ->
    %% TODO: Verify device certificate / token
    DeviceIdStr = binary_to_list(DeviceId),
    io:format("  [WS] Device authenticated: ~s~n", [DeviceIdStr]),

    %% Register this WebSocket PID with the connection manager
    gen_server:call(aegis_connection_mgr, {register, DeviceIdStr, self()}),
    gen_server:call(aegis_presence, {set_status, DeviceIdStr, online}),

    Reply = jsx:encode(#{
        <<"type">> => <<"auth_ok">>,
        <<"deviceId">> => DeviceId,
        <<"status">> => <<"authenticated">>
    }),
    {reply, {text, Reply}, State#{authenticated => true, device_id => DeviceIdStr}};

%% Send encrypted message
handle_message(#{<<"type">> := <<"message">>, 
                  <<"to">> := RecipientDeviceId,
                  <<"payload">> := EncryptedPayload}, 
               #{authenticated := true, device_id := SenderDeviceId} = State) ->
    
    RecipientStr = binary_to_list(RecipientDeviceId),
    MessageId = generate_message_id(),
    
    %% Decode base64 payload
    Blob = base64:decode(EncryptedPayload),
    
    %% Route through message router (zero-knowledge — we never look inside)
    case gen_server:call(aegis_connection_mgr, {lookup, RecipientStr}) of
        {ok, RecipientPid} ->
            %% Recipient online — deliver directly via their WebSocket process
            RecipientPid ! {deliver_message, SenderDeviceId, Blob, MessageId},
            io:format("  [WS] Message ~s routed: ~s -> ~s (ONLINE)~n",
                      [MessageId, SenderDeviceId, RecipientStr]),
            Reply = jsx:encode(#{
                <<"type">> => <<"ack">>,
                <<"messageId">> => list_to_binary(MessageId),
                <<"status">> => <<"delivered">>
            }),
            {reply, {text, Reply}, State};
        error ->
            %% Recipient offline — queue for later
            %% TODO: Store in Redis/Cassandra offline queue
            io:format("  [WS] Message ~s queued: ~s -> ~s (OFFLINE)~n",
                      [MessageId, SenderDeviceId, RecipientStr]),
            Reply = jsx:encode(#{
                <<"type">> => <<"ack">>,
                <<"messageId">> => list_to_binary(MessageId),
                <<"status">> => <<"queued">>
            }),
            {reply, {text, Reply}, State}
    end;

%% Presence update
handle_message(#{<<"type">> := <<"presence">>, <<"status">> := Status},
               #{authenticated := true, device_id := DeviceId} = State) ->
    StatusStr = binary_to_list(Status),
    gen_server:call(aegis_presence, {set_status, DeviceId, list_to_atom(StatusStr)}),
    {ok, State};

%% Device lookup
handle_message(#{<<"type">> := <<"lookup">>, <<"userId">> := _UserId},
               #{authenticated := true} = State) ->
    %% TODO: Query identity service for user's devices and public keys
    Reply = jsx:encode(#{
        <<"type">> => <<"lookup_result">>,
        <<"devices">> => []
    }),
    {reply, {text, Reply}, State};

%% Not authenticated
handle_message(_Msg, #{authenticated := false} = State) ->
    Reply = jsx:encode(#{
        <<"type">> => <<"error">>,
        <<"message">> => <<"Not authenticated. Send auth message first.">>
    }),
    {reply, {text, Reply}, State};

%% Unknown message type
handle_message(Msg, State) ->
    io:format("  [WS] Unknown message type: ~p~n", [Msg]),
    {ok, State}.

%%====================================================================
%% Helpers
%%====================================================================

generate_message_id() ->
    <<A:32, B:16, C:16, D:16, E:48>> = crypto:strong_rand_bytes(16),
    lists:flatten(io_lib:format("~8.16.0b-~4.16.0b-~4.16.0b-~4.16.0b-~12.16.0b",
                                 [A, B, C, D, E])).
