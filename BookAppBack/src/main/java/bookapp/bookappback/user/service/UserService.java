package bookapp.bookappback.user.service;

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
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("사용자를 찾을 수 없습니다: " + email));
        return new UserDetailsImpl(user);
    }

    public UserResponse signUp(SignUpRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("이미 사용중인 이메일입니다.");
        }
        userRepository.findByNickname(request.getNickname()).ifPresent(u -> {
            throw new IllegalArgumentException("이미 사용중인 닉네임입니다.");
        });

        User user = new User(
                request.getEmail(),
                passwordEncoder.encode(request.getPassword()),
                request.getNickname(),
                request.getProfileImage()
        );
        userRepository.save(user);
        return new UserResponse(user.getId(), user.getEmail(), user.getNickname(), user.getProfileImage(), user.getCreatedAt().toString());
    }

    @Transactional(readOnly = true)
    public TokenResponse signIn(SignInRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("등록된 사용자가 없습니다."));

        if (!passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("비밀번호가 일치하지 않습니다.");
        }

        String token = jwtUtil.generateToken(user.getId(), user.getEmail());
        UserResponse userResponse = new UserResponse(user.getId(), user.getEmail(), user.getNickname(), user.getProfileImage(), user.getCreatedAt().toString());
        return new TokenResponse(token, jwtUtil.getExpirationTimeInSeconds(), userResponse);
    }

    public UserResponse getUserProfile(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        return new UserResponse(user.getId(), user.getEmail(), user.getNickname(), user.getProfileImage(), user.getCreatedAt().toString());
    }

    public void updateUserProfile(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));

        if (request.getNickname() != null) {
            userRepository.findByNickname(request.getNickname()).ifPresent(existingUser -> {
                if (!existingUser.getId().equals(userId)) {
                    throw new IllegalArgumentException("이미 사용중인 닉네임입니다.");
                }
            });
            user.setNickname(request.getNickname());
        }

        if (request.getProfileImage() != null) {
            user.setProfileImage(request.getProfileImage());
        }
        userRepository.save(user);
    }

    public void changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));

        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPassword())) {
            throw new IllegalArgumentException("현재 비밀번호가 일치하지 않습니다.");
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }
}