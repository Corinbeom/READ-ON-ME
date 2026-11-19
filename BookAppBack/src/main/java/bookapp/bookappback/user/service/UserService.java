package bookapp.bookappback.user.service;

import bookapp.bookappback.common.exception.AppException;
import bookapp.bookappback.common.exception.UserExceptions;
import bookapp.bookappback.common.util.JwtUtil;
import bookapp.bookappback.security.UserDetailsImpl;
import bookapp.bookappback.security.dto.ChangePasswordRequest;
import bookapp.bookappback.security.dto.SignInRequest;
import bookapp.bookappback.security.dto.SignUpRequest;
import bookapp.bookappback.security.dto.TokenResponse;
import bookapp.bookappback.user.dto.UpdateProfileRequest;
import bookapp.bookappback.user.dto.UserResponse;
import bookapp.bookappback.user.entity.User;
import bookapp.bookappback.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional
public class UserService implements UserDetailsService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        if (!username.startsWith(UserDetailsImpl.KAKAO_SUBJECT_PREFIX)) {
            return userRepository.findByEmail(username).map(UserDetailsImpl::new)
                    .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다"));
        }
        try {
            long id = Long.parseLong(username.substring(UserDetailsImpl.KAKAO_SUBJECT_PREFIX.length()));
            return userRepository.findById(id)
                    .filter(user -> user.getKakaoId() != null && user.getEmail() == null)
                    .map(UserDetailsImpl::new)
                    .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다"));
        } catch (NumberFormatException e) {
            throw new UsernameNotFoundException("사용자를 찾을 수 없습니다");
        }
    }

    public UserResponse signUp(SignUpRequest request) {

        // 이메일 중복 확인
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new UserExceptions.EmailDuplicateException(request.getEmail());
        }

        // 닉네임 중복 확인
        userRepository.findByNickname(request.getNickname()).ifPresent(u -> {
            throw new UserExceptions.NickNameDuplicateException(request.getNickname());
        });

        User user = new User(
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                request.getNickname(),
                request.getProfileImage(),
                request.getBirthYear()
        );
        userRepository.save(user);

        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImage(),
                user.getBirthYear(),
                user.getCreatedAt().toString()
        );
    }

    @Transactional(readOnly = true)
    public TokenResponse signIn(SignInRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(UserExceptions.InvalidLoginException::new);

        if (user.getPassword() == null || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new UserExceptions.InvalidLoginException();
        }

        return issueToken(user);
    }

    public TokenResponse signInWithKakao(long kakaoId) {
        User user = userRepository.findByKakaoId(kakaoId)
                .orElseGet(() -> userRepository.saveAndFlush(User.forKakao(kakaoId, suggestNickname(null))));
        return issueToken(user);
    }

    @Transactional(readOnly = true)
    public String suggestNickname(String exclude) {
        for (int i = 0; i < ReadingNickname.MAX_ATTEMPTS; i++) {
            String candidate = ReadingNickname.next();
            if (!candidate.equals(exclude) && !userRepository.existsByNickname(candidate)) return candidate;
        }
        throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, "NICKNAME_UNAVAILABLE", "닉네임을 만들지 못했어요. 잠시 후 다시 시도해주세요.");
    }

    static boolean violatesConstraint(DataIntegrityViolationException failure, String constraint) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof ConstraintViolationException violation) {
                return constraint.equalsIgnoreCase(violation.getConstraintName());
            }
        }
        return false;
    }

    private TokenResponse issueToken(User user) {
        String token = jwtUtil.generateToken(user.getId(), new UserDetailsImpl(user).getUsername());
        return new TokenResponse(token, jwtUtil.getExpirationTimeInSeconds(), toResponse(user));
    }

    private UserResponse toResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getNickname(),
                user.getProfileImage(),
                user.getBirthYear(),
                user.getCreatedAt().toString()
        );
    }

    public UserResponse getUserProfile(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        return toResponse(user);
    }

    public UserResponse updateUserProfile(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        String nickname = request.getNickname() == null ? null : request.getNickname().strip();
        if (nickname != null) {
            if (nickname.length() < 2) throw new IllegalArgumentException("닉네임은 2~10자로 입력해주세요.");
            userRepository.findByNickname(nickname).ifPresent(existingUser -> {
                if (!existingUser.getId().equals(userId)) {
                    throw new UserExceptions.NickNameDuplicateException(nickname);
                }
            });
            user.setNickname(nickname);
        }

        if (request.getProfileImage() != null) {
            user.setProfileImage(request.getProfileImage());
        }

        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException failure) {
            if (nickname != null && violatesConstraint(failure, User.NICKNAME_CONSTRAINT)) {
                throw new UserExceptions.NickNameDuplicateException(nickname);
            }
            throw failure;
        }
        return toResponse(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UserExceptions.UserNotFoundException(userId));

        if (user.getPassword() == null || !passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new UserExceptions.PasswordMismatchException();
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }
}
