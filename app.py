from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import json
import os
import re
import uuid
import random
import smtplib
from email.mime.text import MIMEText
from datetime import datetime, timedelta
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

app = Flask(__name__)
CORS(app)  # Разрешаем запросы с фронтенда

# Конфигурация
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'avi', 'mov', 'mp3', 'wav', 'ogg', 'pdf', 'txt'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Файлы для хранения данных
USERS_FILE = 'users.json'
POSTS_FILE = 'posts.json'
CHAT_FILE = 'chat_messages.json'
LOGIN_ATTEMPTS_FILE = 'login_attempts.json'
VERIFICATION_FILE = 'verification_requests.json'
PENDING_REGISTRATIONS_FILE = 'pending_registrations.json'
EMAIL_SEND_LIMITS_FILE = 'email_send_limits.json'

GMAIL_USER = os.environ.get('GMAIL_USER', 'markuskvant4@gmail.com')
GMAIL_APP_PASSWORD = os.environ.get('GMAIL_APP_PASSWORD', '')
CODE_VALID_MINUTES = 15
RESEND_COOLDOWN_MINUTES = 7
MAX_CODE_ATTEMPTS = 3
MAX_NICKNAME_ATTEMPTS = 3
EMAIL_REGEX = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')

# Создаем папки если их нет
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'avatars'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'posts'), exist_ok=True)

def load_data(filename):
    """Загружает данные из JSON файла"""
    if not os.path.exists(filename):
        return []
    with open(filename, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []

def save_data(filename, data):
    """Сохраняет данные в JSON файл"""
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def allowed_file(filename):
    """Проверяет разрешенное расширение файла"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file, subfolder=''):
    """Сохраняет загруженный файл и возвращает путь"""
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        # Генерируем уникальное имя
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], subfolder, unique_filename)
        file.save(filepath)
        return unique_filename, filepath
    return None, None

def load_login_attempts():
    """Загружает данные о попытках входа"""
    if not os.path.exists(LOGIN_ATTEMPTS_FILE):
        return {}
    with open(LOGIN_ATTEMPTS_FILE, 'r', encoding='utf-8') as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return {}

def save_login_attempts(attempts):
    """Сохраняет данные о попытках входа"""
    with open(LOGIN_ATTEMPTS_FILE, 'w', encoding='utf-8') as f:
        json.dump(attempts, f, ensure_ascii=False, indent=2)

def is_ip_blocked(ip_address):
    """Проверяет, заблокирован ли IP-адрес после 3 неудачных попыток"""
    attempts = load_login_attempts()
    if ip_address not in attempts:
        return False
    ip_data = attempts[ip_address]
    if ip_data.get('blocked_until'):
        blocked_until = datetime.fromisoformat(ip_data['blocked_until'])
        if datetime.now() < blocked_until:
            return True
        else:
            # Срок блокировки истёк, удаляем запись
            del attempts[ip_address]
            save_login_attempts(attempts)
            return False
    return False

def record_failed_attempt(ip_address):
    """Записывает неудачную попытку входа для IP-адреса"""
    attempts = load_login_attempts()
    if ip_address not in attempts:
        attempts[ip_address] = {'count': 0, 'blocked_until': None}
    
    ip_data = attempts[ip_address]
    ip_data['count'] += 1
    
    if ip_data['count'] >= 3:
        # Блокируем на 20 минут
        blocked_until = datetime.now() + timedelta(minutes=20)
        ip_data['blocked_until'] = blocked_until.isoformat()
    
    save_login_attempts(attempts)

def reset_login_attempts(ip_address):
    """Сбрасывает счётчик попыток для IP-адреса (успешный вход)"""
    attempts = load_login_attempts()
    if ip_address in attempts:
        del attempts[ip_address]
        save_login_attempts(attempts)

def load_json_dict(filename):
    if not os.path.exists(filename):
        return {}
    with open(filename, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError:
            return {}

def save_json_dict(filename, data):
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def normalize_email(email):
    return (email or '').strip().lower()

def is_valid_email(email):
    return bool(EMAIL_REGEX.match(email))

def generate_verification_code():
    return ''.join(str(random.randint(0, 9)) for _ in range(6))

def send_verification_email(to_email, code):
    if not GMAIL_APP_PASSWORD:
        raise RuntimeError('GMAIL_APP_PASSWORD не задан на сервере')

    body = (
        f'Ваш код подтверждения: {code}\n\n'
        f'Код действителен в течении {CODE_VALID_MINUTES} минут.\n\n'
        'Если вы не запрашивали код, просто проигнорируйте это письмо.'
    )
    message = MIMEText(body, 'plain', 'utf-8')
    message['Subject'] = 'Код подтверждения Vibe'
    message['From'] = GMAIL_USER
    message['To'] = to_email

    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        server.send_message(message)

def get_device_resend_wait(device_id):
    limits = load_json_dict(EMAIL_SEND_LIMITS_FILE)
    device_data = limits.get(device_id)
    if not device_data or not device_data.get('last_sent_at'):
        return 0
    last_sent = datetime.fromisoformat(device_data['last_sent_at'])
    cooldown_end = last_sent + timedelta(minutes=RESEND_COOLDOWN_MINUTES)
    remaining = (cooldown_end - datetime.now()).total_seconds()
    return max(0, int(remaining))

def record_device_send(device_id):
    limits = load_json_dict(EMAIL_SEND_LIMITS_FILE)
    limits[device_id] = {'last_sent_at': datetime.now().isoformat()}
    save_json_dict(EMAIL_SEND_LIMITS_FILE, limits)

def find_user_by_email(users, email):
    email = normalize_email(email)
    for user in users:
        if normalize_email(user.get('email', '')) == email:
            return user
    return None

def find_user_by_login(users, login):
    login = (login or '').strip()
    email_login = normalize_email(login)
    for user in users:
        if normalize_email(user.get('email', '')) == email_login:
            return user
        if user.get('username') == login:
            return user
    return None

def user_public_data(user):
    return {
        'id': user['id'],
        'username': user['username'],
        'email': user.get('email'),
        'avatar': user.get('avatar'),
        'bio': user.get('bio', ''),
        'nickname_prompt_pending': user.get('nickname_prompt_pending', False),
    }

def check_user_password(user, password):
    stored_password = user.get('password', '')
    if stored_password.startswith('pbkdf2:sha256:'):
        return check_password_hash(stored_password, password)
    return stored_password == password

# Инициализация файлов если их нет
if not os.path.exists(USERS_FILE):
    save_data(USERS_FILE, [])
if not os.path.exists(POSTS_FILE):
    save_data(POSTS_FILE, [])
if not os.path.exists(CHAT_FILE):
    save_data(CHAT_FILE, [])
if not os.path.exists(LOGIN_ATTEMPTS_FILE):
    save_login_attempts({})
if not os.path.exists(PENDING_REGISTRATIONS_FILE):
    save_json_dict(PENDING_REGISTRATIONS_FILE, {})
if not os.path.exists(EMAIL_SEND_LIMITS_FILE):
    save_json_dict(EMAIL_SEND_LIMITS_FILE, {})

@app.route('/')
def serve_index():
    """Отдаем главную страницу"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Отдаем статические файлы (CSS, JS)"""
    return send_from_directory('.', path)

@app.route('/uploads/<path:filename>')
def serve_uploaded_file(filename):
    """Отдает загруженные файлы"""
    return send_from_directory(UPLOAD_FOLDER, filename)

# API endpoints — регистрация по email
@app.route('/api/register/send-code', methods=['POST'])
def register_send_code():
    """Отправка кода подтверждения на email"""
    data = request.json or {}
    email = normalize_email(data.get('email'))
    password = data.get('password', '')
    device_id = (data.get('device_id') or '').strip()

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email и пароль обязательны'}), 400
    if not is_valid_email(email):
        return jsonify({'success': False, 'message': 'Некорректный email'}), 400
    if len(password) < 4:
        return jsonify({'success': False, 'message': 'Пароль должен содержать минимум 4 символа'}), 400
    if not device_id:
        return jsonify({'success': False, 'message': 'Не удалось определить устройство'}), 400

    wait_seconds = get_device_resend_wait(device_id)
    if wait_seconds > 0:
        minutes = wait_seconds // 60
        seconds = wait_seconds % 60
        if minutes > 0:
            msg = f'Повторная отправка кода возможна через {minutes} мин. {seconds} сек.'
        else:
            msg = f'Повторная отправка кода возможна через {seconds} сек.'
        return jsonify({
            'success': False,
            'message': msg,
            'resend_wait_seconds': wait_seconds
        }), 429

    users = load_data(USERS_FILE)
    if find_user_by_email(users, email):
        return jsonify({'success': False, 'message': 'Пользователь с таким email уже зарегистрирован'}), 400

    code = generate_verification_code()
    try:
        send_verification_email(email, code)
    except Exception as e:
        print(f'[EMAIL ERROR] {e}')
        return jsonify({
            'success': False,
            'message': 'Не удалось отправить письмо. Проверьте настройки почты на сервере.'
        }), 500

    pending = load_json_dict(PENDING_REGISTRATIONS_FILE)
    pending[email] = {
        'password': password,
        'code': code,
        'expires_at': (datetime.now() + timedelta(minutes=CODE_VALID_MINUTES)).isoformat(),
        'code_attempts': 0,
        'device_id': device_id,
        'created_at': datetime.now().isoformat(),
    }
    save_json_dict(PENDING_REGISTRATIONS_FILE, pending)
    record_device_send(device_id)

    return jsonify({
        'success': True,
        'message': f'Код отправлен на {email}',
        'expires_in_minutes': CODE_VALID_MINUTES,
        'resend_wait_seconds': RESEND_COOLDOWN_MINUTES * 60,
    })

@app.route('/api/register/resend-wait', methods=['GET'])
def register_resend_wait():
    device_id = (request.args.get('device_id') or '').strip()
    if not device_id:
        return jsonify({'success': False, 'resend_wait_seconds': 0}), 400
    wait_seconds = get_device_resend_wait(device_id)
    return jsonify({'success': True, 'resend_wait_seconds': wait_seconds})

@app.route('/api/register/verify-code', methods=['POST'])
def register_verify_code():
    """Проверка кода и создание аккаунта"""
    data = request.json or {}
    email = normalize_email(data.get('email'))
    code = (data.get('code') or '').strip()

    if not email or not code:
        return jsonify({'success': False, 'message': 'Email и код обязательны'}), 400
    if not re.fullmatch(r'\d{6}', code):
        return jsonify({'success': False, 'message': 'Код должен состоять из 6 цифр'}), 400

    pending = load_json_dict(PENDING_REGISTRATIONS_FILE)
    registration = pending.get(email)
    if not registration:
        return jsonify({'success': False, 'message': 'Сначала запросите код регистрации'}), 400

    expires_at = datetime.fromisoformat(registration['expires_at'])
    if datetime.now() > expires_at:
        del pending[email]
        save_json_dict(PENDING_REGISTRATIONS_FILE, pending)
        return jsonify({'success': False, 'message': 'Срок действия кода истёк. Запросите новый.'}), 400

    if registration.get('code_attempts', 0) >= MAX_CODE_ATTEMPTS:
        del pending[email]
        save_json_dict(PENDING_REGISTRATIONS_FILE, pending)
        return jsonify({
            'success': False,
            'message': 'Превышено число попыток. Запросите новый код.'
        }), 400

    if registration['code'] != code:
        registration['code_attempts'] = registration.get('code_attempts', 0) + 1
        pending[email] = registration
        save_json_dict(PENDING_REGISTRATIONS_FILE, pending)
        left = MAX_CODE_ATTEMPTS - registration['code_attempts']
        return jsonify({
            'success': False,
            'message': f'Неверный код. Осталось попыток: {max(0, left)}',
            'attempts_left': max(0, left),
        }), 400

    users = load_data(USERS_FILE)
    if find_user_by_email(users, email):
        del pending[email]
        save_json_dict(PENDING_REGISTRATIONS_FILE, pending)
        return jsonify({'success': False, 'message': 'Пользователь уже зарегистрирован'}), 400

    new_id = max((u.get('id', 0) for u in users), default=0) + 1
    new_user = {
        'id': new_id,
        'email': email,
        'username': email,
        'password': registration['password'],
        'avatar': None,
        'bio': '',
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat(),
        'following': [],
        'followers': [],
        'bookmarks': [],
        'verified': False,
        'nickname_prompt_pending': True,
        'nickname_attempts': 0,
    }
    users.append(new_user)
    save_data(USERS_FILE, users)

    del pending[email]
    save_json_dict(PENDING_REGISTRATIONS_FILE, pending)

    return jsonify({
        'success': True,
        'message': 'Email подтверждён',
        'user': user_public_data(new_user),
        'nickname_attempts_left': MAX_NICKNAME_ATTEMPTS,
    })

@app.route('/api/register/set-nickname', methods=['POST'])
def register_set_nickname():
    """Установка ника после регистрации (3 попытки)"""
    data = request.json or {}
    user_id = data.get('user_id')
    nickname = (data.get('nickname') or '').strip()
    skip = data.get('skip', False)

    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400

    users = load_data(USERS_FILE)
    user_index = -1
    for i, user in enumerate(users):
        if str(user['id']) == str(user_id):
            user_index = i
            break

    if user_index == -1:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

    user = users[user_index]
    if skip or not nickname:
        user['username'] = user.get('email', user['username'])
        user['nickname_prompt_pending'] = False
        user['updated_at'] = datetime.now().isoformat()
        users[user_index] = user
        save_data(USERS_FILE, users)
        return jsonify({
            'success': True,
            'message': 'Ник не выбран, используется email',
            'user': user_public_data(user),
        })

    if user.get('nickname_attempts', 0) >= MAX_NICKNAME_ATTEMPTS:
        user['username'] = user.get('email', user['username'])
        user['nickname_prompt_pending'] = False
        user['updated_at'] = datetime.now().isoformat()
        users[user_index] = user
        save_data(USERS_FILE, users)
        return jsonify({
            'success': True,
            'message': 'Попытки закончились, используется email как ник',
            'user': user_public_data(user),
        })

    if len(nickname) < 3 or len(nickname) > 20:
        user['nickname_attempts'] = user.get('nickname_attempts', 0) + 1
        users[user_index] = user
        save_data(USERS_FILE, users)
        left = MAX_NICKNAME_ATTEMPTS - user['nickname_attempts']
        return jsonify({
            'success': False,
            'message': 'Ник должен быть от 3 до 20 символов',
            'attempts_left': max(0, left),
        }), 400

    if '@' in nickname:
        user['nickname_attempts'] = user.get('nickname_attempts', 0) + 1
        users[user_index] = user
        save_data(USERS_FILE, users)
        left = MAX_NICKNAME_ATTEMPTS - user['nickname_attempts']
        return jsonify({
            'success': False,
            'message': 'Ник не может быть email-адресом',
            'attempts_left': max(0, left),
        }), 400

    for other in users:
        if other['id'] != user['id'] and other['username'].lower() == nickname.lower():
            user['nickname_attempts'] = user.get('nickname_attempts', 0) + 1
            users[user_index] = user
            save_data(USERS_FILE, users)
            left = MAX_NICKNAME_ATTEMPTS - user['nickname_attempts']
            return jsonify({
                'success': False,
                'message': 'Этот ник уже занят',
                'attempts_left': max(0, left),
            }), 400

    user['username'] = nickname
    user['nickname_prompt_pending'] = False
    user['nickname_attempts'] = 0
    user['updated_at'] = datetime.now().isoformat()
    users[user_index] = user
    save_data(USERS_FILE, users)

    return jsonify({
        'success': True,
        'message': 'Ник установлен',
        'user': user_public_data(user),
    })

@app.route('/api/login', methods=['POST'])
def login():
    """Авторизация по email и паролю"""
    data = request.json or {}
    email = normalize_email(data.get('email') or data.get('username'))
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'success': False, 'message': 'Email и пароль обязательны'}), 400

    ip_address = request.remote_addr
    if is_ip_blocked(ip_address):
        attempts = load_login_attempts()
        ip_data = attempts.get(ip_address, {})
        blocked_until = ip_data.get('blocked_until')
        if blocked_until:
            blocked_time = datetime.fromisoformat(blocked_until)
            remaining = blocked_time - datetime.now()
            minutes = int(remaining.total_seconds() / 60) + 1
            return jsonify({
                'success': False,
                'message': f'IP-адрес заблокирован. Попробуйте через {minutes} минут.'
            }), 403
        return jsonify({
            'success': False,
            'message': 'IP-адрес заблокирован. Попробуйте через 20 минут.'
        }), 403

    users = load_data(USERS_FILE)
    user = find_user_by_login(users, email)

    if user and check_user_password(user, password):
        reset_login_attempts(ip_address)
        if user.get('nickname_prompt_pending') and user.get('username') == user.get('email'):
            pass
        return jsonify({
            'success': True,
            'message': 'Вход выполнен',
            'user': user_public_data(user),
        })

    record_failed_attempt(ip_address)
    return jsonify({'success': False, 'message': 'Неверный email или пароль'}), 401

@app.route('/api/profile', methods=['GET'])
def get_profile():
    """Получение профиля пользователя"""
    user_id = request.args.get('user_id')
    username = request.args.get('username')
    
    users = load_data(USERS_FILE)
    
    for user in users:
        if (user_id and str(user['id']) == str(user_id)) or (username and user['username'] == username):
            # Не возвращаем пароль
            user_data = {k: v for k, v in user.items() if k != 'password'}
            return jsonify({'success': True, 'user': user_data})
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/profile/stats', methods=['GET'])
def get_profile_stats():
    """Получение статистики профиля пользователя"""
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    users = load_data(USERS_FILE)
    posts = load_data(POSTS_FILE)
    
    user = None
    for u in users:
        if str(u['id']) == str(user_id):
            user = u
            break
    
    if not user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    
    # Посты пользователя
    user_posts = [post for post in posts if post.get('author_id') == int(user_id)]
    
    # Общее количество лайков на постах пользователя
    total_likes = sum(post.get('likes', 0) for post in user_posts)
    
    # Количество репостов пользователя (посты с original_post_id)
    reposts_count = sum(1 for post in posts if post.get('original_author') == user['username'])
    
    # Подписчики и подписки
    followers_count = len(user.get('followers', []))
    following_count = len(user.get('following', []))
    
    return jsonify({
        'success': True,
        'stats': {
            'posts_count': len(user_posts),
            'total_likes': total_likes,
            'reposts_count': reposts_count,
            'followers_count': followers_count,
            'following_count': following_count
        }
    })

@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    """Обновление профиля пользователя"""
    data = request.form.to_dict()
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    users = load_data(USERS_FILE)
    
    for i, user in enumerate(users):
        if str(user['id']) == str(user_id):
            # Обновляем поля
            if 'username' in data and data['username']:
                # Проверяем уникальность имени
                new_username = data['username']
                if new_username != user['username']:
                    for other_user in users:
                        if other_user['username'] == new_username and other_user['id'] != user['id']:
                            return jsonify({'success': False, 'message': 'Имя пользователя уже занято'}), 400
                user['username'] = new_username
            
            if 'password' in data and data['password']:
                user['password'] = data['password']
            
            if 'bio' in data:
                user['bio'] = data['bio']
            
            # Обработка аватарки
            if 'avatar' in request.files:
                avatar_file = request.files['avatar']
                if avatar_file and avatar_file.filename:
                    filename, filepath = save_uploaded_file(avatar_file, 'avatars')
                    if filename:
                        # Удаляем старый аватар если есть
                        if user.get('avatar'):
                            old_path = os.path.join(app.config['UPLOAD_FOLDER'], 'avatars', user['avatar'])
                            if os.path.exists(old_path):
                                os.remove(old_path)
                        user['avatar'] = filename
            
            user['updated_at'] = datetime.now().isoformat()
            users[i] = user
            save_data(USERS_FILE, users)
            
            # Возвращаем обновленного пользователя без пароля
            user_data = {k: v for k, v in user.items() if k != 'password'}
            return jsonify({'success': True, 'message': 'Профиль обновлен', 'user': user_data})
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/posts', methods=['GET'])
def get_posts():
    """Получение всех постов или постов конкретного пользователя"""
    author_id = request.args.get('author_id')
    posts = load_data(POSTS_FILE)
    users = load_data(USERS_FILE)
    
    # Создаем словарь пользователей для быстрого доступа
    user_dict = {user['id']: user for user in users if 'id' in user}
    
    # Обогащаем посты аватарами авторов
    for post in posts:
        author_id_val = post.get('author_id')
        if author_id_val and author_id_val in user_dict:
            user = user_dict[author_id_val]
            post['author_avatar'] = user.get('avatar')
        else:
            post['author_avatar'] = None
    
    if author_id:
        try:
            author_id = int(author_id)
            posts = [post for post in posts if post.get('author_id') == author_id]
        except ValueError:
            pass
    
    # Сортируем по дате (новые сначала)
    posts.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return jsonify({'success': True, 'posts': posts})

@app.route('/api/posts', methods=['POST'])
def create_post():
    """Создание нового поста с поддержкой файлов"""
    try:
        print(f"[DEBUG] create_post called, method: {request.method}, content-type: {request.content_type}")
        # Поддержка как JSON, так и form-data
        if request.is_json:
            data = request.json
            files_data = {}
            print(f"[DEBUG] JSON data: {data}")
        else:
            data = request.form.to_dict()
            files_data = request.files
            print(f"[DEBUG] Form data keys: {list(data.keys())}, files keys: {list(files_data.keys())}")
        
        title = data.get('title')
        content = data.get('content')
        author = data.get('author')
        author_id = data.get('author_id')
        
        if not title or not content or not author:
            return jsonify({'success': False, 'message': 'Заполните все обязательные поля'}), 400
        
        posts = load_data(POSTS_FILE)
        
        # Обработка загруженных файлов (только для form-data)
        uploaded_files = []
        for file_key in files_data:
            file = files_data[file_key]
            if file and file.filename:
                filename, filepath = save_uploaded_file(file, 'posts')
                if filename:
                    file_type = 'image' if filename.lower().endswith(('png', 'jpg', 'jpeg', 'gif')) else \
                               'video' if filename.lower().endswith(('mp4', 'avi', 'mov')) else \
                               'audio' if filename.lower().endswith(('mp3', 'wav', 'ogg')) else 'file'
                    uploaded_files.append({
                        'filename': filename,
                        'original_name': file.filename,
                        'type': file_type,
                        'url': f'/uploads/posts/{filename}'
                    })
        
        new_post = {
            'id': len(posts) + 1,
            'title': title,
            'content': content,
            'author': author,
            'author_id': int(author_id) if author_id else 0,
            'created_at': datetime.now().isoformat(),
            'likes': 0,
            'comments': [],
            'files': uploaded_files,
            'video_url': data.get('video_url', '')  # Для обратной совместимости
        }
        
        posts.append(new_post)
        save_data(POSTS_FILE, posts)
        
        return jsonify({
            'success': True,
            'message': 'Пост создан',
            'post': new_post
        })
    except Exception as e:
        return jsonify({'success': False, 'message': f'Ошибка при создании поста: {str(e)}'}), 500

@app.route('/api/posts/<int:post_id>/like', methods=['POST'])
def like_post(post_id):
    """Лайк/дизлайк поста с проверкой пользователя"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    posts = load_data(POSTS_FILE)
    
    for post in posts:
        if post['id'] == post_id:
            # Инициализируем списки если их нет
            if 'liked_by' not in post:
                post['liked_by'] = []
            
            # Проверяем, лайкал ли уже пользователь
            if user_id in post['liked_by']:
                # Убираем лайк
                post['liked_by'].remove(user_id)
                post['likes'] = max(0, post.get('likes', 1) - 1)
                liked = False
            else:
                # Добавляем лайк
                post['liked_by'].append(user_id)
                post['likes'] = post.get('likes', 0) + 1
                liked = True
            
            save_data(POSTS_FILE, posts)
            return jsonify({
                'success': True,
                'likes': post['likes'],
                'liked': liked,
                'liked_by': post['liked_by']
            })
    
    return jsonify({'success': False, 'message': 'Пост не найден'}), 404

@app.route('/api/posts/<int:post_id>/comment', methods=['POST'])
def add_comment(post_id):
    """Добавление комментария к посту"""
    data = request.json
    author = data.get('author')
    text = data.get('text')
    
    if not author or not text:
        return jsonify({'success': False, 'message': 'Заполните все поля комментария'}), 400
    
    posts = load_data(POSTS_FILE)
    
    for post in posts:
        if post['id'] == post_id:
            comment = {
                'id': len(post.get('comments', [])) + 1,
                'author': author,
                'text': text,
                'created_at': datetime.now().isoformat()
            }
            
            if 'comments' not in post:
                post['comments'] = []
            post['comments'].append(comment)
            
            save_data(POSTS_FILE, posts)
            return jsonify({'success': True, 'comment': comment})
    
    return jsonify({'success': False, 'message': 'Пост не найден'}), 404

@app.route('/api/users', methods=['GET'])
def get_users():
    """Получение списка пользователей (без паролей)"""
    users = load_data(USERS_FILE)
    # Удаляем пароли
    safe_users = []
    for user in users:
        safe_user = {k: v for k, v in user.items() if k != 'password'}
        safe_users.append(safe_user)
    return jsonify({'success': True, 'users': safe_users})

@app.route('/api/users/<int:user_id>/follow', methods=['POST'])
def follow_user(user_id):
    """Подписаться/отписаться от пользователя"""
    data = request.json
    follower_id = data.get('follower_id')
    
    if not follower_id:
        return jsonify({'success': False, 'message': 'ID подписчика обязателен'}), 400
    
    users = load_data(USERS_FILE)
    
    target_user = None
    follower_user = None
    target_idx = -1
    follower_idx = -1
    
    for i, user in enumerate(users):
        if user['id'] == user_id:
            target_user = user
            target_idx = i
        if user['id'] == follower_id:
            follower_user = user
            follower_idx = i
    
    if not target_user or not follower_user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    
    # Запрещаем подписку на самого себя
    if user_id == follower_id:
        return jsonify({'success': False, 'message': 'Нельзя подписаться на самого себя'}), 400
    
    # Инициализируем списки если их нет
    if 'following' not in follower_user:
        follower_user['following'] = []
    if 'followers' not in target_user:
        target_user['followers'] = []
    
    is_following = user_id in follower_user['following']
    
    if is_following:
        # Отписаться
        follower_user['following'].remove(user_id)
        target_user['followers'].remove(follower_id)
        action = 'unfollowed'
    else:
        # Подписаться
        follower_user['following'].append(user_id)
        target_user['followers'].append(follower_id)
        action = 'followed'
    
    # Сохраняем изменения
    users[target_idx] = target_user
    users[follower_idx] = follower_user
    save_data(USERS_FILE, users)
    
    return jsonify({
        'success': True,
        'action': action,
        'following_count': len(follower_user['following']),
        'followers_count': len(target_user['followers'])
    })

@app.route('/api/users/<int:user_id>/followers', methods=['GET'])
def get_followers(user_id):
    """Получить список подписчиков пользователя"""
    users = load_data(USERS_FILE)
    
    for user in users:
        if user['id'] == user_id:
            followers = user.get('followers', [])
            # Получаем данные подписчиков
            follower_details = []
            for follower_id in followers:
                for u in users:
                    if u['id'] == follower_id:
                        follower_details.append({
                            'id': u['id'],
                            'username': u['username'],
                            'avatar': u.get('avatar')
                        })
                        break
            return jsonify({'success': True, 'followers': follower_details})
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/users/<int:user_id>/following', methods=['GET'])
def get_following(user_id):
    """Получить список подписок пользователя"""
    users = load_data(USERS_FILE)
    
    for user in users:
        if user['id'] == user_id:
            following = user.get('following', [])
            # Получаем данные подписок
            following_details = []
            for following_id in following:
                for u in users:
                    if u['id'] == following_id:
                        following_details.append({
                            'id': u['id'],
                            'username': u['username'],
                            'avatar': u.get('avatar')
                        })
                        break
            return jsonify({'success': True, 'following': following_details})
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/posts/<int:post_id>/bookmark', methods=['POST'])
def bookmark_post(post_id):
    """Добавить/удалить пост из закладок"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    users = load_data(USERS_FILE)
    posts = load_data(POSTS_FILE)
    
    # Проверяем существование поста
    post_exists = any(post['id'] == post_id for post in posts)
    if not post_exists:
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    user_idx = -1
    for i, user in enumerate(users):
        if user['id'] == user_id:
            user_idx = i
            if 'bookmarks' not in user:
                user['bookmarks'] = []
            
            is_bookmarked = post_id in user['bookmarks']
            
            if is_bookmarked:
                # Удалить из закладок
                user['bookmarks'].remove(post_id)
                action = 'removed'
            else:
                # Добавить в закладки
                user['bookmarks'].append(post_id)
                action = 'added'
            
            users[i] = user
            save_data(USERS_FILE, users)
            
            return jsonify({
                'success': True,
                'action': action,
                'bookmarks_count': len(user['bookmarks'])
            })
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/posts/<int:post_id>/repost', methods=['POST'])
def repost_post(post_id):
    """Репост поста"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    users = load_data(USERS_FILE)
    posts = load_data(POSTS_FILE)
    
    # Находим оригинальный пост
    original_post = None
    for post in posts:
        if post['id'] == post_id:
            original_post = post
            break
    
    if not original_post:
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    # Находим пользователя
    user = None
    for u in users:
        if u['id'] == user_id:
            user = u
            break
    
    if not user:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    
    # Увеличиваем счетчик репостов у оригинального поста
    if 'reposts' not in original_post:
        original_post['reposts'] = 0
    original_post['reposts'] += 1
    
    # Создаем репост
    new_post = {
        'id': len(posts) + 1,
        'title': f"Репост: {original_post['title']}",
        'content': original_post['content'],
        'author': user['username'],
        'author_id': user_id,
        'created_at': datetime.now().isoformat(),
        'likes': 0,
        'comments': [],
        'files': original_post.get('files', []),
        'video_url': original_post.get('video_url', ''),
        'original_post_id': post_id,
        'original_author': original_post['author'],
        'reposts': 0  # У репоста свои репосты
    }
    
    posts.append(new_post)
    # Обновляем оригинальный пост в списке
    for i, p in enumerate(posts):
        if p['id'] == post_id:
            posts[i] = original_post
            break
    
    save_data(POSTS_FILE, posts)
    
    return jsonify({
        'success': True,
        'message': 'Пост репостнут',
        'post': new_post,
        'original_post_reposts': original_post['reposts']
    })

@app.route('/api/posts/<int:post_id>', methods=['GET'])
def get_post(post_id):
    """Получение конкретного поста по ID"""
    posts = load_data(POSTS_FILE)
    
    for post in posts:
        if post['id'] == post_id:
            return jsonify({
                'success': True,
                'post': post
            })
    
    return jsonify({
        'success': False,
        'message': 'Пост не найден'
    }), 404

@app.route('/api/posts/<int:post_id>', methods=['PUT'])
def update_post(post_id):
    """Обновление поста"""
    posts = load_data(POSTS_FILE)
    
    # Находим пост
    post_index = -1
    for i, post in enumerate(posts):
        if post['id'] == post_id:
            post_index = i
            break
    
    if post_index == -1:
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    # Проверяем авторизацию (в реальном приложении проверяем токен)
    data = request.json
    if not data:
        return jsonify({'success': False, 'message': 'Нет данных для обновления'}), 400
    
    # Обновляем поля
    updated_post = posts[post_index]
    if 'title' in data:
        updated_post['title'] = data['title']
    if 'content' in data:
        updated_post['content'] = data['content']
    if 'video_url' in data:
        updated_post['video_url'] = data['video_url']
    
    # Обновляем время редактирования
    updated_post['updated_at'] = datetime.now().isoformat()
    
    posts[post_index] = updated_post
    save_data(POSTS_FILE, posts)
    
    return jsonify({
        'success': True,
        'message': 'Пост обновлен',
        'post': updated_post
    })

@app.route('/api/posts/<int:post_id>', methods=['DELETE'])
def delete_post(post_id):
    """Удаление поста"""
    posts = load_data(POSTS_FILE)
    
    # Находим пост
    post_index = -1
    for i, post in enumerate(posts):
        if post['id'] == post_id:
            post_index = i
            break
    
    if post_index == -1:
        return jsonify({'success': False, 'message': 'Пост не найден'}), 404
    
    # Удаляем пост
    deleted_post = posts.pop(post_index)
    save_data(POSTS_FILE, posts)
    
    return jsonify({
        'success': True,
        'message': 'Пост удален',
        'post': deleted_post
    })

@app.route('/api/broadcast', methods=['POST'])
def broadcast_message():
    """Рассылка сообщения от админа всем пользователям"""
    data = request.json
    message = data.get('message')
    author = data.get('author', 'Vibe')
    
    if not message:
        return jsonify({'success': False, 'message': 'Сообщение обязательно'}), 400
    
    # Проверяем, что отправитель - админ (в реальном приложении проверяем токен)
    # Для демо просто разрешаем
    
    # Загружаем пользователей
    users = load_data(USERS_FILE)
    
    # Создаем уведомление для официального чата
    notification = {
        'id': int(datetime.now().timestamp() * 1000),
        'sender': author,
        'text': message,
        'time': datetime.now().isoformat(),
        'is_broadcast': True
    }
    
    # В реальном приложении сохраняем уведомление в базу данных
    # Для демо просто возвращаем успех
    
    return jsonify({
        'success': True,
        'message': 'Уведомление отправлено всем пользователям',
        'notification': notification,
        'users_count': len(users)
    })

@app.route('/api/chat/messages', methods=['GET'])
def get_chat_messages():
    """Получение сообщений между двумя пользователями"""
    user1_id = request.args.get('user1_id', type=int)
    user2_id = request.args.get('user2_id', type=int)
    
    if not user1_id or not user2_id:
        return jsonify({'success': False, 'message': 'Необходимо указать оба ID пользователей'}), 400
    
    messages = load_data(CHAT_FILE)
    
    # Фильтруем сообщения между этими пользователями (в любом направлении)
    filtered = []
    for msg in messages:
        if (msg['sender_id'] == user1_id and msg['receiver_id'] == user2_id) or \
           (msg['sender_id'] == user2_id and msg['receiver_id'] == user1_id):
            filtered.append(msg)
    
    # Сортируем по времени
    filtered.sort(key=lambda x: x.get('timestamp', ''))
    
    return jsonify({
        'success': True,
        'messages': filtered
    })

@app.route('/api/chat/send', methods=['POST'])
def send_chat_message():
    """Отправка сообщения в чат"""
    data = request.json
    sender_id = data.get('sender_id')
    receiver_id = data.get('receiver_id')
    text = data.get('text')
    
    if not sender_id or not receiver_id or not text:
        return jsonify({'success': False, 'message': 'Необходимы sender_id, receiver_id и text'}), 400
    
    # Проверяем существование пользователей
    users = load_data(USERS_FILE)
    sender_exists = any(u['id'] == sender_id for u in users)
    receiver_exists = any(u['id'] == receiver_id for u in users)
    
    if not sender_exists or not receiver_exists:
        return jsonify({'success': False, 'message': 'Отправитель или получатель не найден'}), 404
    
    messages = load_data(CHAT_FILE)
    
    new_message = {
        'id': len(messages) + 1,
        'sender_id': sender_id,
        'receiver_id': receiver_id,
        'text': text,
        'timestamp': datetime.now().isoformat(),
        'read': False
    }
    
    messages.append(new_message)
    save_data(CHAT_FILE, messages)
    
    return jsonify({
        'success': True,
        'message': 'Сообщение отправлено',
        'chat_message': new_message
    })

@app.route('/api/chat/messages/unread', methods=['GET'])
def get_unread_messages():
    """Получение непрочитанных сообщений для пользователя"""
    user_id = request.args.get('user_id', type=int)
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    messages = load_data(CHAT_FILE)
    unread = []
    for msg in messages:
        if msg['receiver_id'] == user_id and not msg.get('read', False):
            unread.append(msg)
    
    # Сортируем по времени
    unread.sort(key=lambda x: x.get('timestamp', ''))
    
    return jsonify({
        'success': True,
        'unread_count': len(unread),
        'messages': unread
    })

@app.route('/api/chat/messages/mark-read', methods=['POST'])
def mark_messages_as_read():
    """Пометить сообщения как прочитанные"""
    data = request.json
    user_id = data.get('user_id')
    sender_id = data.get('sender_id')  # опционально: пометить сообщения от конкретного отправителя
    message_ids = data.get('message_ids', [])  # опционально: конкретные ID сообщений
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    messages = load_data(CHAT_FILE)
    updated = 0
    for msg in messages:
        if msg['receiver_id'] == user_id and not msg.get('read', False):
            if sender_id and msg['sender_id'] != sender_id:
                continue
            if message_ids and msg['id'] not in message_ids:
                continue
            msg['read'] = True
            updated += 1
    
    if updated > 0:
        save_data(CHAT_FILE, messages)
    
    return jsonify({
        'success': True,
        'updated': updated,
        'message': f'Помечено {updated} сообщений как прочитанные'
    })

@app.route('/api/user/online', methods=['POST'])
def update_online_status():
    """Обновление времени последней активности пользователя"""
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id:
        return jsonify({'success': False, 'message': 'ID пользователя обязателен'}), 400
    
    users = load_data(USERS_FILE)
    updated = False
    
    for i, user in enumerate(users):
        if user['id'] == user_id:
            user['last_seen'] = datetime.now().isoformat()
            users[i] = user
            save_data(USERS_FILE, users)
            updated = True
            break
    
    if updated:
        return jsonify({'success': True, 'message': 'Статус обновлен', 'last_seen': users[i]['last_seen']})
    else:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/user/<int:user_id>/status', methods=['GET'])
def get_user_status(user_id):
    """Получение статуса пользователя (онлайн/офлайн)"""
    users = load_data(USERS_FILE)
    
    for user in users:
        if user['id'] == user_id:
            last_seen_str = user.get('last_seen')
            if not last_seen_str:
                return jsonify({'success': True, 'online': False, 'last_seen': None})
            
            try:
                last_seen = datetime.fromisoformat(last_seen_str)
                now = datetime.now()
                diff_minutes = (now - last_seen).total_seconds() / 60
                online = diff_minutes < 5  # Считаем онлайн если был активен последние 5 минут
                return jsonify({
                    'success': True,
                    'online': online,
                    'last_seen': last_seen_str,
                    'minutes_ago': round(diff_minutes, 1)
                })
            except ValueError:
                return jsonify({'success': True, 'online': False, 'last_seen': last_seen_str})
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Получение статистики"""
    users = load_data(USERS_FILE)
    posts = load_data(POSTS_FILE)
    
    today = datetime.now().date().isoformat()
    posts_today = sum(1 for post in posts if post.get('created_at', '').startswith(today))
    
    total_likes = sum(post.get('likes', 0) for post in posts)
    
    return jsonify({
        'success': True,
        'stats': {
            'total_users': len(users),
            'total_posts': len(posts),
            'posts_today': posts_today,
            'total_likes': total_likes
        }
    })

@app.route('/api/verification/submit', methods=['POST'])
def submit_verification_request():
    """Подача заявки на верификацию (галочку)"""
    data = request.form
    user_id = data.get('user_id')
    text = data.get('text')
    
    if not user_id or not text:
        return jsonify({'success': False, 'message': 'ID пользователя и текст заявки обязательны'}), 400
    
    # Проверяем существование пользователя
    users = load_data(USERS_FILE)
    user_exists = any(u['id'] == int(user_id) for u in users)
    if not user_exists:
        return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404
    
    # Обработка загруженных файлов
    uploaded_files = []
    if 'files' in request.files:
        files = request.files.getlist('files')
        for file in files:
            if file and file.filename:
                filename, filepath = save_uploaded_file(file, 'verification')
                if filename:
                    uploaded_files.append({
                        'filename': filename,
                        'original_name': file.filename,
                        'url': f'/uploads/verification/{filename}'
                    })
    
    # Загружаем существующие заявки
    requests = load_data(VERIFICATION_FILE)
    
    new_request = {
        'id': len(requests) + 1,
        'user_id': int(user_id),
        'text': text,
        'files': uploaded_files,
        'status': 'pending',  # pending, approved, rejected
        'created_at': datetime.now().isoformat(),
        'processed_at': None,
        'processed_by': None,
        'response_message': None
    }
    
    requests.append(new_request)
    save_data(VERIFICATION_FILE, requests)
    
    return jsonify({
        'success': True,
        'message': 'Заявка на верификацию отправлена',
        'request': new_request
    })

@app.route('/api/verification/requests', methods=['GET'])
def get_verification_requests():
    """Получение списка заявок на верификацию (для админа)"""
    status = request.args.get('status', 'pending')
    requests = load_data(VERIFICATION_FILE)
    
    filtered = [r for r in requests if r['status'] == status]
    
    return jsonify({
        'success': True,
        'requests': filtered
    })

@app.route('/api/verification/<int:request_id>/process', methods=['POST'])
def process_verification_request(request_id):
    """Обработка заявки на верификацию (подтвердить/отклонить)"""
    data = request.json
    action = data.get('action')  # 'approve' или 'reject'
    admin_id = data.get('admin_id')
    response_message = data.get('response_message', '')
    
    if action not in ['approve', 'reject']:
        return jsonify({'success': False, 'message': 'Действие должно быть approve или reject'}), 400
    
    requests = load_data(VERIFICATION_FILE)
    users = load_data(USERS_FILE)
    
    # Находим заявку
    req_index = -1
    for i, req in enumerate(requests):
        if req['id'] == request_id:
            req_index = i
            break
    
    if req_index == -1:
        return jsonify({'success': False, 'message': 'Заявка не найдена'}), 404
    
    request_data = requests[req_index]
    
    # Обновляем статус заявки
    request_data['status'] = 'approved' if action == 'approve' else 'rejected'
    request_data['processed_at'] = datetime.now().isoformat()
    request_data['processed_by'] = admin_id
    request_data['response_message'] = response_message
    
    # Обновляем статус верификации пользователя
    user_index = -1
    for i, user in enumerate(users):
        if user['id'] == request_data['user_id']:
            user_index = i
            break
    
    if user_index != -1:
        users[user_index]['verified'] = (action == 'approve')
        save_data(USERS_FILE, users)
    
    # Сохраняем обновленную заявку
    requests[req_index] = request_data
    save_data(VERIFICATION_FILE, requests)
    
    # Отправляем уведомление в официальный чат
    user = next((u for u in users if u['id'] == request_data['user_id']), None)
    username = user['username'] if user else 'Неизвестный'
    
    broadcast_msg = f"Заявка на верификацию от @{username} {'одобрена' if action == 'approve' else 'отклонена'}. {response_message}"
    
    # Здесь можно вызвать broadcast_message, но для простоты просто вернем успех
    
    return jsonify({
        'success': True,
        'message': f'Заявка {action}ed',
        'request': request_data,
        'user_verified': (action == 'approve')
    })

@app.route('/api/user/<int:user_id>/verification-status', methods=['GET'])
def get_verification_status(user_id):
    """Получение статуса верификации пользователя"""
    users = load_data(USERS_FILE)
    
    for user in users:
        if user['id'] == user_id:
            return jsonify({
                'success': True,
                'verified': user.get('verified', False)
            })
    
    return jsonify({'success': False, 'message': 'Пользователь не найден'}), 404

if __name__ == '__main__':
    print("Запуск социальной сети Vibe с расширенными функциями...")
    print("Откройте в браузере: https://vibe-rit4.onrender.com")
    print("Папка для загрузок:", UPLOAD_FOLDER)
    app.run(debug=True, host='0.0.0.0', port=5000)